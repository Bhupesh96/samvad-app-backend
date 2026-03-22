const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../../config/db-pr-mis');

// --- 1. GET ALL USERS ---
// --- GET ALL STATES ---
router.get('/state', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();

    const sql = `
      SELECT
        CAST(id AS UNSIGNED) AS id,
        state,
        created_at
      FROM states
      ORDER BY state ASC
    `;

    const rows = await conn.query(sql);

    const formattedRows = rows.map(row => ({
      ...row,
      id: Number(row.id) // 👈 Prevent BigInt JSON error
    }));

    res.status(200).json({
      success: true,
      count: formattedRows.length,
      data: formattedRows
    });

  } catch (err) {
    console.error("State Fetch Error:", err.message);
    res.status(500).json({
      success: false,
      message: err.message
    });
  } finally {
    if (conn) conn.release();
  }
});
// --- GET DISTRICTS BY STATE ---
router.get('/district/:state', async (req, res) => {
  const { state } = req.params;
  let conn;

  try {
    conn = await pool.getConnection();

    const sql = `
      SELECT
        CAST(id AS UNSIGNED) AS id,
        district,
        state,
        created_at
      FROM districts
      WHERE state = ?
      ORDER BY district ASC
    `;

    const rows = await conn.query(sql, [state]);

    const formattedRows = rows.map(row => ({
      ...row,
      id: Number(row.id)  // Prevent BigInt error
    }));

    res.status(200).json({
      success: true,
      count: formattedRows.length,
      data: formattedRows
    });

  } catch (err) {
    console.error("District Fetch Error:", err.message);
    res.status(500).json({
      success: false,
      message: err.message
    });
  } finally {
    if (conn) conn.release();
  }
});

// GET DISTRICT AREAS BY DISTRICT
router.get('/district-areas/:district', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();

    const rows = await conn.query(`
      SELECT CAST(id AS UNSIGNED) as id, district_area
      FROM district_areas
      WHERE district = ?
      ORDER BY district_area ASC
    `, [req.params.district]);

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// CREATE DISTRICT AREA
router.post('/district-areasss', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();

    const { district, district_area } = req.body;

    if (!district || !district_area) {
      return res.status(400).json({
        success: false,
        message: 'District and Area required'
      });
    }

    // Prevent duplicate
    const existing = await conn.query(`
      SELECT id FROM district_areas
      WHERE district = ? AND district_area = ?
    `, [district, district_area]);

    if (existing.length > 0) {
      return res.json({
        success: true,
        message: 'Already exists'
      });
    }

    await conn.query(`
      INSERT INTO district_areas (district, district_area, created_at)
      VALUES (?, ?, NOW())
    `, [district, district_area]);

    res.json({
      success: true,
      message: 'District Area Added'
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});


// CREATE DISTRICT AREA
router.post('/district-areas', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const district = req.body.district;
    const district_area = req.body.district_area.trim().toUpperCase(); // Strict UpperCase

    if (!district || !district_area) {
      return res.status(400).json({ success: false, message: 'District and Area required' });
    }

    // Check for existing area in THIS district specifically
    const [existing] = await conn.query(
      `SELECT id FROM district_areas WHERE district = ? AND UPPER(district_area) = ?`,
      [district, district_area]
    );

    if (existing && existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Area already exists in this district' });
    }

    await conn.query(
      `INSERT INTO district_areas (district, district_area, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`,
      [district, district_area]
    );

    res.json({ success: true, message: 'Area Added' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});
// GET all active tags for the multi-select UI
router.get('/event-tags', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const sql = `SELECT id,tag_name FROM master_event_tags WHERE is_active = 1 ORDER BY tag_name ASC`;
    const rows = await conn.query(sql);
    res.status(200).json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

router.get('/hoardings', async (req, res) => {
  try {

    const rows = await pool.query(`
      SELECT id, hoarding_id, location_address, size_h_x_w
      FROM assets
      WHERE status = 1
      ORDER BY hoarding_id ASC
    `);

    res.json({ success: true, data: rows });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// =======================================
// 1️⃣ GET ALL CATEGORIES
// =======================================
// =======================================
// GET CATEGORIES WITH SUBCATEGORIES
// =======================================
router.get('/categories', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();

    const rows = await conn.query(`
      SELECT
        c.id,
        c.category_type,
        c.category,
        sc.sub_category
      FROM categories c
             LEFT JOIN sub_categories sc
                       ON sc.category_id = c.id
      ORDER BY c.id DESC
    `);

    // Group Data
    const grouped = {};

    rows.forEach(row => {
      if (!grouped[row.id]) {
        grouped[row.id] = {
          id: row.id,
          category_type: row.category_type,
          category: row.category,
          sub_categories: []
        };
      }

      if (row.sub_category) {
        grouped[row.id].sub_categories.push(row.sub_category);
      }
    });

    res.json({
      success: true,
      data: Object.values(grouped)
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// =======================================
// 2️⃣ CREATE CATEGORY
// =======================================
router.post('/categories', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();

    const { category_type, category } = req.body;

    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required'
      });
    }

    // Prevent duplicate
    const existing = await conn.query(
      `SELECT id FROM categories WHERE category = ?`,
      [category]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Category already exists'
      });
    }

    await conn.query(`
      INSERT INTO categories
      (category_type, category, created_at)
      VALUES (?, ?, NOW())
    `, [
      category_type || 'fixed',
      category
    ]);

    res.json({
      success: true,
      message: 'Category created successfully'
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});


// =======================================
// 3️⃣ GET ALL SUB CATEGORIES
// =======================================
router.get('/sub-categories', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();

    const rows = await conn.query(`
      SELECT
        sc.id,
        sc.category_id,
        c.category,
        sc.sub_category,
        sc.created_at
      FROM sub_categories sc
      LEFT JOIN categories c ON c.id = sc.category_id
      ORDER BY sc.id DESC
    `);

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});


// =======================================
// 4️⃣ CREATE SUB CATEGORY
// =======================================
router.post('/sub-categories', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();

    const { category_id, sub_category } = req.body;

    if (!category_id || !sub_category) {
      return res.status(400).json({
        success: false,
        message: 'Category and Sub Category required'
      });
    }

    // Prevent duplicate
    const existing = await conn.query(
      `SELECT id FROM sub_categories
       WHERE category_id = ? AND sub_category = ?`,
      [category_id, sub_category]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Sub Category already exists'
      });
    }

    await conn.query(`
      INSERT INTO sub_categories
      (category_id, sub_category, created_at)
      VALUES (?, ?, NOW())
    `, [
      category_id,
      sub_category
    ]);

    res.json({
      success: true,
      message: 'Sub Category created successfully'
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});


// =======================================
// 5️⃣ CREATE ASSET
// =======================================
router.post('/assets', async (req, res) => {
  let conn;

  try {
    conn = await pool.getConnection();

    const {
      category_id,
      sub_category_id,
      hoarding_id,
      state,
      district,
      district_category,
      district_area,
      size_h_x_w,
      size_sq_feet,
      agency_name,
      location_address
    } = req.body;

    if (!category_id || !sub_category_id || !hoarding_id) {
      return res.status(400).json({
        success: false,
        message: 'Required fields missing'
      });
    }

    // Get category & subcategory names
    const categoryData = await conn.query(
      `SELECT category FROM categories WHERE id = ?`,
      [category_id]
    );

    const subCategoryData = await conn.query(
      `SELECT sub_category FROM sub_categories WHERE id = ?`,
      [sub_category_id]
    );

    await conn.query(`
      INSERT INTO assets
      (asset_type,
       hoarding_id,
       category,
       sub_category,
       state,
       district,
       district_category,
       district_area,
       size_h_x_w,
       size_sq_feet,
       agency_name,
       location_address,
       created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      'fixed',
      hoarding_id,
      categoryData[0]?.category,
      subCategoryData[0]?.sub_category,
      state,
      district,
      district_category,
      district_area,
      size_h_x_w,
      size_sq_feet,
      agency_name,
      location_address
    ]);

    res.json({
      success: true,
      message: 'Asset created successfully'
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});


// GET ALL ASSETS WITH FILTERS
router.get('/assets', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();

    // Destructure filters from the request query
    const {
      category,
      sub_category,
      state,
      district,
      district_area,
      agency_name,
      hoarding_id
    } = req.query;

    let query = `SELECT * FROM assets WHERE 1=1`;
    let params = [];

    // Apply filters if they exist in the request
    if (category) {
      query += ` AND category = ?`;
      params.push(category);
    }
    if (sub_category) {
      query += ` AND sub_category = ?`;
      params.push(sub_category);
    }
    if (state) {
      query += ` AND state = ?`;
      params.push(state);
    }
    if (district) {
      query += ` AND district = ?`;
      params.push(district);
    }
    if (district_area) {
      query += ` AND district_area = ?`;
      params.push(district_area);
    }
    if (agency_name) {
      query += ` AND agency_name = ?`;
      params.push(agency_name);
    }

    // Use LIKE for partial matching on Hoarding ID
    if (hoarding_id) {
      query += ` AND hoarding_id LIKE ?`;
      params.push(`%${hoarding_id}%`);
    }

    // Order by most recent
    query += ` ORDER BY created_at DESC`;

    const rows = await conn.query(query, params);

    res.json({
      success: true,
      data: rows
    });
  } catch (err) {
    // Return error message if the query fails
    res.status(500).json({
      success: false,
      message: err.message
    });
  } finally {
    if (conn) conn.release();
  }
});


module.exports = router;

