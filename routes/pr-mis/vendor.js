const express = require('express');
const router = express.Router();
const pool = require('../../config/db-pr-mis');


// ------------------------------
// VENDOR LOGIN API
// ------------------------------
router.post('/login', async (req, res) => {

  const { contact, password } = req.body;
  let conn;

  try {

    if (!contact || !password) {
      return res.status(400).json({
        success: false,
        message: "contact and password required"
      });
    }

    conn = await pool.getConnection();

    const sql = `
      SELECT id, name, email, contact, state, city, password, role, status
      FROM vendor
      WHERE contact = ? LIMIT 1
    `;

    const rows = await conn.query(sql, [contact]);

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid contact or password"
      });
    }

    const vendor = rows[0];

    if (vendor.status !== 1) {
      return res.status(403).json({
        success: false,
        message: "Vendor account inactive"
      });
    }

    const bcrypt = require('bcrypt');
    // const isMatch = await bcrypt.compare(password, vendor.password);
    //
    // if (!isMatch) {
    //   return res.status(401).json({
    //     success: false,
    //     message: "Invalid contact or password"
    //   });
    // }

    // Generate token
    const jwt = require('jsonwebtoken');

    const token = jwt.sign(
      { id: vendor.id, role: vendor.role },
      process.env.JWT_SECRET || "vendor_secret_key",
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      vendor: {
        id: vendor.id,
        name: vendor.name,
        email: vendor.email,
        contact: vendor.contact,
        state: vendor.state,
        city: vendor.city,
        role: vendor.role
      }
    });

  } catch (err) {

    console.error("Vendor Login Error:", err);

    res.status(500).json({
      success: false,
      message: err.message
    });

  } finally {
    if (conn) conn.release();
  }

});

// --- 1.
// --- GET ALL ACTIVE VENDORS ---
router.get('/', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();

    const sql = `
      SELECT
        CAST(id AS UNSIGNED) AS id,
        hoarding_applicable,
        assigned_hoarding_id,
        category,
        sub_category,
        name,
        email,
        contact,
        contact_persons,
        state,
        city,
        district_area,
        role,
        status,
        created_at,
        updated_at
      FROM vendor
      WHERE status = 1
      ORDER BY id DESC
    `;

    const rows = await conn.query(sql);

    const formattedRows = rows.map(row => ({
      ...row,
      id: Number(row.id), // 👈 important
      district_area: row.district_area
        ? JSON.parse(row.district_area)
        : null
    }));

    res.status(200).json({
      success: true,
      count: formattedRows.length,
      data: formattedRows
    });

  } catch (err) {
    console.error("Vendor Fetch Error:", err.message);
    res.status(500).json({
      success: false,
      message: err.message
    });
  } finally {
    if (conn) conn.release();
  }
});
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  let conn;

  try {
    conn = await pool.getConnection();

    const sql = `
      SELECT
        id, hoarding_applicable, assigned_hoarding_id,
        category, sub_category, name, email, contact,
        contact_persons, state, city, district_area,
        role, status, created_at, updated_at
      FROM vendor
      WHERE id = ? AND status = 1
    `;

    const rows = await conn.query(sql, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found"
      });
    }

    const vendor = {
      ...rows[0],
      district_area: rows[0].district_area
        ? JSON.parse(rows[0].district_area)
        : null
    };

    res.status(200).json({
      success: true,
      data: vendor
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  } finally {
    if (conn) conn.release();
  }
});
router.post('/create-loginOLD', async (req, res) => {
  const { vendor_id, email, contact, state, district, password, contact_persons } = req.body;

  let conn;

  try {
    conn = await pool.getConnection();

    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = `
      UPDATE vendor
      SET email = ?,
          contact = ?,
          state = ?,
          city = ?,
          password = ?,
          contact_persons = ?
      WHERE id = ?
    `;

    await conn.query(sql, [
      email,
      contact,
      state,
      district,
      hashedPassword,
      contact_persons,   // 👈 JSON string stored
      vendor_id
    ]);

    res.status(201).json({
      success: true,
      message: "Vendor login created successfully."
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  } finally {
    if (conn) conn.release();
  }
});

router.post('/create-login', async (req, res) => {
  const { vendor_id, email, contact, state, district, password, contact_persons } = req.body;

  let conn;
  try {
    conn = await pool.getConnection();

    // Check if vendor exists
    const [vendor] = await conn.query('SELECT id FROM vendor WHERE id = ?', [vendor_id]);
    if (vendor.length === 0) {
      return res.status(404).json({ success: false, message: "Vendor not found." });
    }

    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);

    // SQL Update query mapping to your specific table columns
    const sql = `
      UPDATE vendor
      SET email = ?,
          contact = ?,
          state = ?,
          city = ?,
          password = ?,
          plain_password = ?,
          contact_persons = ?,
          updated_at = NOW()
      WHERE id = ?
    `;

    // contact_persons should already be a string from the frontend payload
    await conn.query(sql, [
      email,
      contact,
      state,
      district,
      hashedPassword,
      password, // Storing plain password as per your table schema
      contact_persons,
      vendor_id
    ]);

    res.status(200).json({
      success: true,
      message: "Vendor login credentials updated successfully."
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.code === 'ER_DUP_ENTRY' ? "Email already exists." : err.message
    });
  } finally {
    if (conn) conn.release();
  }
});

router.put('/update-login/:id', async (req, res) => {

  const { id } = req.params;
  const { email, contact, state, district, password, contact_persons } = req.body;

  let conn;

  try {
    conn = await pool.getConnection();

    const bcrypt = require('bcrypt');
    const hashedPassword = password
      ? await bcrypt.hash(password, 10)
      : null;

    let sql;
    let params;

    if (hashedPassword) {
      sql = `
        UPDATE vendor
        SET email=?, contact=?, state=?, city=?, password=?, contact_persons=?
        WHERE id=?
      `;
      params = [email, contact, state, district, hashedPassword, contact_persons, id];
    } else {
      sql = `
        UPDATE vendor
        SET email=?, contact=?, state=?, city=?, contact_persons=?
        WHERE id=?
      `;
      params = [email, contact, state, district, contact_persons, id];
    }

    await conn.query(sql, params);

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});
router.patch('/status/:id', async (req, res) => {

  const { id } = req.params;
  const { status } = req.body;

  let conn;

  try {
    conn = await pool.getConnection();

    await conn.query(
      `UPDATE vendor SET status=? WHERE id=?`,
      [status, id]
    );

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});
router.delete('/:id', async (req, res) => {

  const { id } = req.params;
  let conn;

  try {
    conn = await pool.getConnection();

    await conn.query(
      `UPDATE vendor SET status=0 WHERE id=?`,
      [id]
    );

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

router.get('/vendors', async (req, res) => {
  try {
    const rows = await pool.query(`
      SELECT id, name FROM vendor WHERE status = 1
    `);

    res.json({ success: true, data: rows });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


//api created by bhupesh

// ------------------------------
// CREATE FIELD AGENT API
// ------------------------------
router.post('/create-agent', async (req, res) => {
  // We extract the data sent from the mobile app
  const { vendor_id, name, contact, password } = req.body;
  let conn;

  try {
    // 1. Validate input
    if (!vendor_id || !name || !contact || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required."
      });
    }

    conn = await pool.getConnection();

    // 2. Check if an agent with this exact number already exists
    const checkSql = `SELECT id FROM fieldagent WHERE number = ? LIMIT 1`;
    const existingAgent = await conn.query(checkSql, [contact]);

    if (existingAgent.length > 0) {
      return res.status(409).json({
        success: false,
        message: "An agent with this contact number already exists."
      });
    }

    // 3. Hash the password for the 'password' column
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Insert into your specific `fieldagent` table
    const insertSql = `
      INSERT INTO fieldagent 
      (added_by, name, number, role, password, confirmation_password, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
    `;

    // Mapping: vendor_id -> added_by | contact -> number | plain password -> confirmation_password
    await conn.query(insertSql, [
      vendor_id,
      name,
      contact,
      'Field Agent',     // Hardcoded role
      hashedPassword,    // Hashed for 'password' column
      password           // Plain text for 'confirmation_password' column
    ]);

    res.status(201).json({
      success: true,
      message: "Field Agent registered successfully."
    });

  } catch (err) {
    console.error("Create Agent Error:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  } finally {
    if (conn) conn.release();
  }
});
// GET agents for a specific vendor
router.get('/agents/:vendor_id', async (req, res) => {
  const { vendor_id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
        "SELECT id, name, number, role, confirmation_password as password, status FROM fieldagent WHERE added_by = ? ORDER BY id DESC",
        [vendor_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally { if (conn) conn.release(); }
});

// UPDATE agent status or details
router.put('/update-agent/:id', async (req, res) => {
  const { id } = req.params;
  const { name, number, status, password } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);

    await conn.query(
        "UPDATE fieldagent SET name=?, number=?, status=?, password=?, confirmation_password=?, updated_at=NOW() WHERE id=?",
        [name, number, status, hashedPassword, password, id]
    );
    res.json({ success: true, message: "Agent updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally { if (conn) conn.release(); }
});
module.exports = router;
