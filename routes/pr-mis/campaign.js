const express = require("express");
const router = express.Router();
const pool = require("../../config/db-pr-mis");
const multer = require("multer");

// =============================
// MULTER CONFIG
// =============================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// =============================
// UPLOAD IMAGE
// =============================
router.post("/upload-image", upload.single("image"), async (req, res) => {
  try {
    const { campaign_id } = req.body;

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    await pool.query(
      `
      INSERT INTO campaign_images (campaign_id, image)
      VALUES (?, ?)
    `,
      [campaign_id, req.file.filename],
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================
// GET ALL CAMPAIGNS
// =============================
router.get("/", async (req, res) => {
  try {
    const rows = await pool.query(`
      SELECT
        c.*,
        v.name AS vendor_name,
        GROUP_CONCAT(DISTINCT ci.image) AS campaign_images,
        GROUP_CONCAT(DISTINCT cp.pdf) AS campaign_pdfs
      FROM campaign c
             LEFT JOIN vendor v ON v.id = c.vendor_id
             LEFT JOIN campaign_images ci ON ci.campaign_id = c.id
             LEFT JOIN campaign_pdfs cp ON cp.campaign_id = c.id
      GROUP BY c.id
      ORDER BY c.id DESC
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
// =============================
// GET FILTERED LIST
// =============================
router.get("/list", async (req, res) => {
  try {
    const { type } = req.query;
    let sql = "SELECT * FROM campaign";

    if (type === "ongoing") {
      sql += " WHERE end_date >= CURDATE()";
    }

    if (type === "previous") {
      sql += " WHERE end_date < CURDATE()";
    }

    const rows = await pool.query(sql);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================
// CREATE CAMPAIGN
// =============================
// =============================
// CREATE CAMPAIGN (FULL VERSION)
// =============================
// important for dynamic vendor files
router.post("/create", upload.any(), async (req, res) => {
  let conn;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction(); // ✅ START TRANSACTION

    const {
      campaign_name,
      category,
      sub_category,
      description,
      start_date,
      end_date,
      agency_name,
      status,
    } = req.body;

    // Parse arrays safely
    const vendors = req.body.vendors ? JSON.parse(req.body.vendors) : [];
    const hoardings = req.body.hoardings ? JSON.parse(req.body.hoardings) : [];

    // =============================
    // 1️⃣ INSERT MAIN CAMPAIGN
    // =============================
    const result = await conn.query(
      `
        INSERT INTO campaign
        (campaign_name, category, sub_category,
         description, start_date, end_date,
         agency_name, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        campaign_name,
        category,
        sub_category,
        description,
        start_date,
        end_date,
        agency_name,
        status || "draft",
      ],
    );

    const campaignId = result.insertId;

    // =============================
    // 2️⃣ HANDLE FILES
    // =============================

    const files = req.files || [];

    for (const file of files) {
      // Images
      if (file.fieldname === "images") {
        await conn.query(
          `
            INSERT INTO campaign_images
            (campaign_id, image, created_at)
            VALUES (?, ?, NOW())
          `,
          [campaignId, file.filename],
        );
      }

      // Campaign PDF
      if (file.fieldname === "pdf") {
        await conn.query(
          `
            INSERT INTO campaign_pdfs
            (campaign_id, pdf, created_at)
            VALUES (?, ?, NOW())
          `,
          [campaignId, file.filename],
        );
      }

      // Temporary Workorder
      if (file.fieldname === "temporary_workorder") {
        await conn.query(
          `
            UPDATE campaign
            SET temporary_workorder = ?
            WHERE id = ?
          `,
          [file.filename, campaignId],
        );
      }

      // Main Workorder
      if (file.fieldname === "workorder") {
        await conn.query(
          `
            UPDATE campaign
            SET workorder = ?
            WHERE id = ?
          `,
          [file.filename, campaignId],
        );
      }

      // Dynamic Vendor Workorders
      if (file.fieldname.startsWith("vendor_workorder_")) {
        const vendorId = file.fieldname.split("_")[2];

        await conn.query(
          `
            INSERT INTO campaign_vendor
            (campaign_id, vendor_id, assigned_from, assigned_to, created_at)
            VALUES (?, ?, ?, ?, NOW())
          `,
          [campaignId, vendorId, start_date, end_date],
        );

        // Save vendor workorder file
        await conn.query(
          `
            UPDATE campaign_vendor
            SET category = ?
            WHERE campaign_id = ? AND vendor_id = ?
          `,
          [file.filename, campaignId, vendorId],
        );
      }
    }

    // =============================
    // 3️⃣ INSERT HOARDINGS
    // =============================
    for (const h of hoardings) {
      await conn.query(
        `
          INSERT INTO campaign_hoardings
          (campaign_id, hoarding_id, from_date, to_date, created_at)
          VALUES (?, ?, ?, ?, NOW())
        `,
        [campaignId, h, start_date, end_date],
      );
    }

    await conn.commit(); // ✅ COMMIT

    res.json({
      success: true,
      campaign_id: campaignId,
    });
  } catch (err) {
    if (conn) await conn.rollback(); // ❌ ROLLBACK ON ERROR

    res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
});

// =============================
// ASSIGN VENDOR
// =============================
router.post("/assign-vendor", async (req, res) => {
  try {
    const {
      campaign_id,
      vendor_id,
      hoarding_id,
      category,
      subcategory,
      assigned_from,
      assigned_to,
    } = req.body;

    await pool.query(
      `
      INSERT INTO campaign_vendor
      (campaign_id, vendor_id, hoarding_id, category, subcategory, assigned_from, assigned_to)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      [
        campaign_id,
        vendor_id,
        hoarding_id,
        category,
        subcategory,
        assigned_from,
        assigned_to,
      ],
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================
// ASSIGN FIELD AGENT
// =============================
router.post("/assign-fieldagent", async (req, res) => {
  try {
    const { campaign_id, fieldagent_id, hoarding_id, category, subcategory } =
      req.body;

    await pool.query(
      `
      INSERT INTO campaign_fieldagent
      (campaign_id, fieldagent_id, hoarding_id, category, subcategory)
      VALUES (?, ?, ?, ?, ?)
    `,
      [campaign_id, fieldagent_id, hoarding_id, category, subcategory],
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1. GET Assigned Campaigns for a Vendor
router.get("/assigned-campaigns/:vendor_id", async (req, res) => {
  const { vendor_id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    // Joins campaign_vendor with campaign to get only campaigns assigned to this vendor
    const rows = await conn.query(
      `
            SELECT 
                c.id, c.campaign_name, c.status, c.images, c.pdf, c.workorder, 
                c.start_date, c.end_date
            FROM campaign c
            JOIN campaign_vendor cv ON c.id = cv.campaign_id
            WHERE cv.vendor_id = ?
            GROUP BY c.id
            ORDER BY c.id DESC
        `,
      [vendor_id],
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

router.get("/campaign-hoardings/:campaign_id/:vendor_id", async (req, res) => {
  const { campaign_id, vendor_id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();

    // ✅ Using CAST to safely join a String to an Integer ID
    const rows = await conn.query(
      `
      SELECT 
        cv.hoarding_id, 
        cv.assigned_from, 
        cv.assigned_to,
        a.location_address, 
        a.size_h_x_w,
        
        -- Safe Fallback Logic
        COALESCE(c.category, a.category, cv.category) AS category,
        COALESCE(sc.sub_category, a.sub_category, cv.subcategory) AS subcategory,
        
        -- DEBUG FIELDS: These will show you exactly what is in your assets table!
        a.category AS raw_asset_category,
        a.sub_category AS raw_asset_subcategory

      FROM campaign_vendor cv
      LEFT JOIN assets a ON cv.hoarding_id = a.hoarding_id 
      
      -- CAST ensures MySQL successfully matches String "2" to Integer 2
      LEFT JOIN categories c ON a.category = CAST(c.id AS CHAR)
      LEFT JOIN sub_categories sc ON a.sub_category = CAST(sc.id AS CHAR)
      
      WHERE cv.campaign_id = ? AND cv.vendor_id = ?
    `,
      [campaign_id, vendor_id],
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

router.post("/assign-field-agent", async (req, res) => {
  const { campaign_id, hoarding_id, fieldagent_id } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();

    // 1. Fetch category & subcategory from campaign_vendor to keep data consistent
    const [vendorData] = await conn.query(
      `SELECT category, subcategory FROM campaign_vendor WHERE campaign_id = ? AND hoarding_id = ? LIMIT 1`,
      [campaign_id, hoarding_id],
    );

    const category = vendorData ? vendorData.category : null;
    const subcategory = vendorData ? vendorData.subcategory : null;

    // 2. Insert into campaign_fieldagent
    await conn.query(
      `
            INSERT INTO campaign_fieldagent (campaign_id, hoarding_id, fieldagent_id, category, subcategory) 
            VALUES (?, ?, ?, ?, ?)
        `,
      [campaign_id, hoarding_id, fieldagent_id, category, subcategory],
    );

    res.json({ success: true, message: "Agent assigned successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});
// 1. GET Campaigns that still have unassigned hoardings for this vendor
router.get("/pending-campaigns/:vendor_id", async (req, res) => {
  const { vendor_id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      `
      SELECT DISTINCT c.id, c.campaign_name 
      FROM campaign c
      JOIN campaign_vendor cv ON c.id = cv.campaign_id
      LEFT JOIN campaign_fieldagent cfa ON cv.campaign_id = cfa.campaign_id AND cv.hoarding_id = cfa.hoarding_id
      WHERE cv.vendor_id = ? AND cfa.id IS NULL
      ORDER BY c.id DESC
    `,
      [vendor_id],
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// 2. GET Hoardings that are unassigned for a specific campaign & vendor
router.get("/pending-hoardings/:campaign_id/:vendor_id", async (req, res) => {
  const { campaign_id, vendor_id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      `
      SELECT 
        cv.hoarding_id, 
        a.location_address, 
        a.size_h_x_w
      FROM campaign_vendor cv
      LEFT JOIN assets a ON cv.hoarding_id = a.hoarding_id 
      LEFT JOIN campaign_fieldagent cfa ON cv.campaign_id = cfa.campaign_id AND cv.hoarding_id = cfa.hoarding_id
      WHERE cv.campaign_id = ? AND cv.vendor_id = ? AND cfa.id IS NULL
    `,
      [campaign_id, vendor_id],
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});
module.exports = router;
