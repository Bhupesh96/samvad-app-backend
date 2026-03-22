const express = require("express");
const router = express.Router();
const pool = require("../../config/db-pr-mis");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
// ------------------------------
// VENDOR LOGIN API
// ------------------------------
router.post("/login", async (req, res) => {
  const { contact, password } = req.body;
  let conn;

  try {
    if (!contact || !password) {
      return res.status(400).json({
        success: false,
        message: "contact and password required",
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
        message: "Invalid contact or password",
      });
    }

    const vendor = rows[0];

    if (vendor.status !== 1) {
      return res.status(403).json({
        success: false,
        message: "Vendor account inactive",
      });
    }

    const bcrypt = require("bcrypt");
    // const isMatch = await bcrypt.compare(password, vendor.password);
    //
    // if (!isMatch) {
    //   return res.status(401).json({
    //     success: false,
    //     message: "Invalid contact or password"
    //   });
    // }

    // Generate token
    const jwt = require("jsonwebtoken");

    const token = jwt.sign(
      { id: vendor.id, role: vendor.role },
      process.env.JWT_SECRET || "vendor_secret_key",
      { expiresIn: "7d" },
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
        role: vendor.role,
      },
    });
  } catch (err) {
    console.error("Vendor Login Error:", err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
});

// --- 1.
// --- GET ALL ACTIVE VENDORS ---
router.get("/", async (req, res) => {
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

    const formattedRows = rows.map((row) => ({
      ...row,
      id: Number(row.id), // 👈 important
      district_area: row.district_area ? JSON.parse(row.district_area) : null,
    }));

    res.status(200).json({
      success: true,
      count: formattedRows.length,
      data: formattedRows,
    });
  } catch (err) {
    console.error("Vendor Fetch Error:", err.message);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
});
router.get("/:id", async (req, res) => {
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
        message: "Vendor not found",
      });
    }

    const vendor = {
      ...rows[0],
      district_area: rows[0].district_area
        ? JSON.parse(rows[0].district_area)
        : null,
    };

    res.status(200).json({
      success: true,
      data: vendor,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
});
router.post("/create-loginOLD", async (req, res) => {
  const {
    vendor_id,
    email,
    contact,
    state,
    district,
    password,
    contact_persons,
  } = req.body;

  let conn;

  try {
    conn = await pool.getConnection();

    const bcrypt = require("bcrypt");
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
      contact_persons, // 👈 JSON string stored
      vendor_id,
    ]);

    res.status(201).json({
      success: true,
      message: "Vendor login created successfully.",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
});

router.post("/create-login", async (req, res) => {
  const {
    vendor_id,
    email,
    contact,
    state,
    district,
    password,
    contact_persons,
  } = req.body;

  let conn;
  try {
    conn = await pool.getConnection();

    // Check if vendor exists
    const [vendor] = await conn.query("SELECT id FROM vendor WHERE id = ?", [
      vendor_id,
    ]);
    if (vendor.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found." });
    }

    const bcrypt = require("bcrypt");
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
      vendor_id,
    ]);

    res.status(200).json({
      success: true,
      message: "Vendor login credentials updated successfully.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message:
        err.code === "ER_DUP_ENTRY" ? "Email already exists." : err.message,
    });
  } finally {
    if (conn) conn.release();
  }
});

router.put("/update-login/:id", async (req, res) => {
  const { id } = req.params;
  const { email, contact, state, district, password, contact_persons } =
    req.body;

  let conn;

  try {
    conn = await pool.getConnection();

    const bcrypt = require("bcrypt");
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    let sql;
    let params;

    if (hashedPassword) {
      sql = `
        UPDATE vendor
        SET email=?, contact=?, state=?, city=?, password=?, contact_persons=?
        WHERE id=?
      `;
      params = [
        email,
        contact,
        state,
        district,
        hashedPassword,
        contact_persons,
        id,
      ];
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
router.patch("/status/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  let conn;

  try {
    conn = await pool.getConnection();

    await conn.query(`UPDATE vendor SET status=? WHERE id=?`, [status, id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  let conn;

  try {
    conn = await pool.getConnection();

    await conn.query(`UPDATE vendor SET status=0 WHERE id=?`, [id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

router.get("/vendors", async (req, res) => {
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
router.post("/create-agent", async (req, res) => {
  // We extract the data sent from the mobile app
  const { vendor_id, name, contact, password } = req.body;
  let conn;

  try {
    // 1. Validate input
    if (!vendor_id || !name || !contact || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required.",
      });
    }

    conn = await pool.getConnection();

    // 2. Check if an agent with this exact number already exists
    const checkSql = `SELECT id FROM fieldagent WHERE number = ? LIMIT 1`;
    const existingAgent = await conn.query(checkSql, [contact]);

    if (existingAgent.length > 0) {
      return res.status(409).json({
        success: false,
        message: "An agent with this contact number already exists.",
      });
    }

    // 3. Hash the password for the 'password' column
    const bcrypt = require("bcrypt");
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
      "Field Agent", // Hardcoded role
      hashedPassword, // Hashed for 'password' column
      password, // Plain text for 'confirmation_password' column
    ]);

    res.status(201).json({
      success: true,
      message: "Field Agent registered successfully.",
    });
  } catch (err) {
    console.error("Create Agent Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
});
// GET agents for a specific vendor
router.get("/agents/:vendor_id", async (req, res) => {
  const { vendor_id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      "SELECT id, name, number, role, confirmation_password as password, status FROM fieldagent WHERE added_by = ? ORDER BY id DESC",
      [vendor_id],
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// UPDATE agent status or details
router.put("/update-agent/:id", async (req, res) => {
  const { id } = req.params;
  const { name, number, status, password } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();
    const bcrypt = require("bcrypt");
    const hashedPassword = await bcrypt.hash(password, 10);

    await conn.query(
      "UPDATE fieldagent SET name=?, number=?, status=?, password=?, confirmation_password=?, updated_at=NOW() WHERE id=?",
      [name, number, status, hashedPassword, password, id],
    );
    res.json({ success: true, message: "Agent updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ------------------------------
// FIELD AGENT LOGIN API
// ------------------------------
router.post("/agent-login", async (req, res) => {
  const { contact, password } = req.body;
  let conn;

  try {
    if (!contact || !password) {
      return res.status(400).json({
        success: false,
        message: "Contact number and password are required",
      });
    }

    conn = await pool.getConnection();

    // 1. Find the agent by their mobile number
    const sql = `
      SELECT id, added_by AS vendor_id, name, number, role, password, status 
      FROM fieldagent 
      WHERE number = ? LIMIT 1
    `;

    const rows = await conn.query(sql, [contact]);

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid contact number or password",
      });
    }

    const agent = rows[0];

    // 2. Check if the vendor disabled this agent
    if (agent.status !== 1) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Please contact your Vendor.",
      });
    }

    // 3. Verify the password
    const bcrypt = require("bcrypt");
    const isMatch = await bcrypt.compare(password, agent.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid contact number or password",
      });
    }

    // 4. Generate JWT Token
    const jwt = require("jsonwebtoken");
    const token = jwt.sign(
      { id: agent.id, role: "field_agent", vendor_id: agent.vendor_id },
      process.env.JWT_SECRET || "agent_secret_key",
      { expiresIn: "7d" },
    );

    // 5. Send success response with Agent Data
    res.json({
      success: true,
      message: "Agent login successful",
      token,
      agent: {
        id: agent.id,
        vendor_id: agent.vendor_id,
        name: agent.name,
        contact: agent.number,
        role: agent.role,
      },
    });
  } catch (err) {
    console.error("Agent Login Error:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    if (conn) conn.release();
  }
});

// ------------------------------
// GET FIELD AGENT TASKS
// ------------------------------
router.get("/agent-tasks/:fieldagent_id", async (req, res) => {
  const { fieldagent_id } = req.params;
  let conn;

  try {
    conn = await pool.getConnection();

    // We join campaign_fieldagent with campaign (for the name) and assets (for location/size)
    const sql = `
      SELECT 
        cfa.id AS assignment_id,
        cfa.campaign_id,
        cfa.hoarding_id,
        cfa.category,
        cfa.subcategory,
        c.campaign_name,
        c.start_date,
        c.end_date,
        a.location_address,
        a.size_h_x_w
      FROM campaign_fieldagent cfa
      JOIN campaign c ON cfa.campaign_id = c.id
      LEFT JOIN assets a ON cfa.hoarding_id = a.hoarding_id
      WHERE cfa.fieldagent_id = ?
      ORDER BY cfa.id DESC
    `;

    const rows = await conn.query(sql, [fieldagent_id]);

    res.json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error("Fetch Agent Tasks Error:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});
// ------------------------------
// GET FIELD AGENT TASKS
// ------------------------------
router.get("/agent-tasks/:fieldagent_id", async (req, res) => {
  const { fieldagent_id } = req.params;
  let conn;

  try {
    conn = await pool.getConnection();

    // We join campaign_fieldagent with campaign (for the name) and assets (for location/size)
    const sql = `
      SELECT 
        cfa.id AS assignment_id,
        cfa.campaign_id,
        cfa.hoarding_id,
        cfa.category,
        cfa.subcategory,
        c.campaign_name,
        c.start_date,
        c.end_date,
        a.location_address,
        a.size_h_x_w
      FROM campaign_fieldagent cfa
      JOIN campaign c ON cfa.campaign_id = c.id
      LEFT JOIN assets a ON cfa.hoarding_id = a.hoarding_id
      WHERE cfa.fieldagent_id = ?
      ORDER BY cfa.id DESC
    `;

    const rows = await conn.query(sql, [fieldagent_id]);

    res.json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error("Fetch Agent Tasks Error:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});
const uploadDirectory = path.join(__dirname, "../../uploads/proofs");
if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}

// 2. Configure Multer to save the file with a unique name
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "proof-" + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

// ------------------------------
// UPLOAD PROOF API
// ------------------------------
router.post("/upload-proof", upload.single("photo"), async (req, res) => {
  // We grab the data sent from the mobile app's FormData
  const { assignment_id, latitude, longitude } = req.body;
  let conn;

  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No photo uploaded" });
    }

    // The secure path where the image was saved
    const imagePath = `/uploads/proofs/${req.file.filename}`;

    conn = await pool.getConnection();

    // STEP 1: Fetch the exact Task details securely from the database
    const taskSql = `
      SELECT campaign_id, fieldagent_id, hoarding_id, category, subcategory 
      FROM campaign_fieldagent 
      WHERE id = ? LIMIT 1
    `;
    const taskRows = await conn.query(taskSql, [assignment_id]);

    if (taskRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Task assignment not found." });
    }

    const task = taskRows[0];

    // STEP 2: Insert the Photo and GPS data into `imageuploadcamp`
    // Note: We are strictly matching your column spelling "longtitude"
    const insertSql = `
      INSERT INTO imageuploadcamp 
      (campaign_id, hoarding_id, category, subcategory, fieldagent_id, image, latitude, longtitude, date, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
    `;

    await conn.query(insertSql, [
      task.campaign_id,
      task.hoarding_id,
      task.category,
      task.subcategory,
      task.fieldagent_id,
      imagePath, // The saved image URL
      latitude, // GPS Lat
      longitude, // GPS Long (mapped to longtitude)
    ]);

    // STEP 3 (Optional but recommended): Mark the assignment as completed
    // If you have a 'status' column in campaign_fieldagent, you can uncomment this!
    /*
    await conn.query(`UPDATE campaign_fieldagent SET status = 'completed' WHERE id = ?`, [assignment_id]);
    */

    res.json({
      success: true,
      message: "Premium proof of execution authenticated and saved.",
      path: imagePath,
    });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({
      success: false,
      message: "Database error during upload sequence.",
    });
  } finally {
    if (conn) conn.release();
  }
});

// ------------------------------
// GET COMPLETED UPLOADS (AGENT)
// ------------------------------
router.get("/agent-completed-tasks/:fieldagent_id", async (req, res) => {
  const { fieldagent_id } = req.params;
  let conn;

  try {
    conn = await pool.getConnection();

    const sql = `
            SELECT 
                i.id AS upload_id,
                i.hoarding_id,
                i.image,
                i.date,
                i.is_verified,
                i.vendor_remarks,
                c.campaign_name
            FROM imageuploadcamp i
            LEFT JOIN campaign c ON i.campaign_id = c.id
            WHERE i.fieldagent_id = ?
            ORDER BY i.id DESC
        `;

    const rows = await conn.query(sql, [fieldagent_id]);

    res.json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error("Fetch Completed Tasks Error:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});
module.exports = router;
