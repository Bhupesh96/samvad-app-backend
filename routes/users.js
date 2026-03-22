// routes/users.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
const pool = require("../config/db-pr-mis");
const jwt = require("jsonwebtoken"); // ✅ --- THIS LINE WAS MISSING ---
// --- Multer Storage Configuration ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const folder =
      file.fieldname === "profile_photo" ? "ProfilePhotos" : "CoverPhotos";
    const folderPath = path.join(__dirname, "../__Files/Users", folder);
    fs.mkdirSync(folderPath, { recursive: true });
    cb(null, folderPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // This equals 5 MB
}).fields([
  { name: "profile_photo", maxCount: 1 },
  { name: "cover_photo", maxCount: 1 },
]);

// --- API Endpoint to Create a New User ---
router.post("/create-user", upload, async (req, res) => {
  let conn;
  console.log("--- New User Creation Request ---");
  console.log("Request Body (Text Fields):", req.body);
  console.log("Request Files (Uploads):", req.files);
  console.log("---------------------------------");
  try {
    const userData = req.body;
    const files = req.files;

    if (!userData.full_name || !userData.email || !userData.password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, and password are required.",
      });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(userData.password, saltRounds);

    const profilePhotoPath = files?.profile_photo?.[0]
      ? `ProfilePhotos/${files.profile_photo[0].filename}`
      : null;
    const coverPhotoPath = files?.cover_photo?.[0]
      ? `CoverPhotos/${files.cover_photo[0].filename}`
      : null;

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const sql = `
      INSERT INTO users (
        full_name, email, password, profile_photo, cover_photo,
        headline, location, about, phone, website, dob, gender, active_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      userData.full_name,
      userData.email,
      hashedPassword,
      profilePhotoPath,
      coverPhotoPath,
      userData.headline || null,
      userData.location || null,
      userData.about || null,
      userData.phone || null,
      userData.website || null,
      userData.dob || null,
      userData.gender || null,
      userData.active_status || "N",
    ];

    const result = await conn.query(sql, params);
    await conn.commit();

    // THIS IS THE CORRECTED BLOCK vvvv
    res.status(201).json({
      success: true,
      message: "User created successfully!",
      userId: Number(result.insertId), // Convert the BigInt to a standard Number
    });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Error creating user:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "An account with this email or phone number already exists.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create user due to a server error.",
      error: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
});

// --- API Endpoint to Get User Details by user_id ---
router.get("/get-user/:user_id", async (req, res) => {
  let conn;
  try {
    const { user_id } = req.params;
    if (!user_id || isNaN(user_id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing user_id.",
      });
    }

    conn = await pool.getConnection();
    const sql = `
      SELECT
        user_id, full_name, email, profile_photo, cover_photo,
        headline, location, about, phone, website, dob, gender,
        active_status, created_at
      FROM users
      WHERE user_id = ? AND delete_status = 'N'
      LIMIT 1
    `;
    const [rows] = await conn.query(sql, [user_id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    res.status(200).json({
      success: true,
      user: rows,
    });
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user.",
      error: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
});

// --- API Endpoint to GET ALL USERS (with Search) ---
// router.get('/', async (req, res) => {
//   let conn;
//   try {
//     cst { search = '' } = req.query; // Get search term from query params
// //     const searchTerm = `%${search}%`;
// //
// //     conn = await pool.getConnection();
// //     // NEVER select the password field
// //     const sql = `
// //         SELEonCT
//          user_id, full_name, email, profile_photo, cover_photo,
//          headline, location, about, phone, website, dob, gender,
//          active_status, created_at
//         FROM users
// --         WHERE  delete_status = 'N' AND full_name LIKE ? OR email LIKE ? OR phone LIKE ?
//         WHERE delete_status = 'N' AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ?)
//         ORDER BY created_at DESC
//     `;
//
//     // CORRECTED LINE: Provide the searchTerm three times
//     const rows = await conn.query(sql, [searchTerm, searchTerm, searchTerm]);
//
//     res.status(200).json({
//       success: true,
//       data: rows,
//     });
//
//   } catch (err) {
//     console.error("Error fetching users:", err);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch users due to a server error.",
//       error: err.message,
//     });
//   } finally {
//     if (conn) conn.release();
//   }
// });

// routes/users.js
router.get("/", async (req, res) => {
  let conn;
  try {
    const { search = "" } = req.query;
    const searchTerm = `%${search}%`;

    conn = await pool.getConnection();
    const sql = `
      SELECT
        user_id, full_name, email, profile_photo, cover_photo,
        headline, location, about, phone, website, dob, gender,
        active_status, created_at
      FROM users
      WHERE delete_status = 'N' AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ?)
      ORDER BY created_at DESC
    `;

    // --- FIX IS ON THIS LINE ---
    // BEFORE (Incorrect): const [rows] = await conn.query(...);
    // AFTER (Correct):
    const rows = await conn.query(sql, [searchTerm, searchTerm, searchTerm]);

    // Now 'rows' is guaranteed to be an array, and the .map() will work.
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const usersWithUrls = rows.map((user) => {
      return {
        ...user,
        profile_photo_url: user.profile_photo
          ? `${baseUrl}/__Files/Users/${user.profile_photo}`
          : null,
        cover_photo_url: user.cover_photo
          ? `${baseUrl}/__Files/Users/${user.cover_photo}`
          : null,
      };
    });

    res.status(200).json({
      success: true,
      data: usersWithUrls,
    });
  } catch (err) {
    // This console.error is very helpful for debugging, as you saw!
    console.error("Error fetching users:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users due to a server error.",
      error: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
});

// --- API Endpoint to TOGGLE USER'S ACTIVE STATUS ---
router.patch("/toggle-status/:userId", async (req, res) => {
  let conn;
  try {
    const { userId } = req.params;

    if (!userId || isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "A valid user ID is required.",
      });
    }

    conn = await pool.getConnection();

    const sql = `
      UPDATE users
      SET active_status = IF(active_status = 'Y', 'N', 'Y')
      WHERE user_id = ?
    `;

    // --- FIX: Remove the array destructuring brackets [ ] ---
    const result = await conn.query(sql, [userId]);

    // This robust check handles different mysql library versions.
    // The actual result packet is usually the first element if it's an array.
    const queryResult = Array.isArray(result) ? result[0] : result;

    if (queryResult.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "User status updated successfully.",
    });
  } catch (err) {
    console.error("Error toggling user status:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update user status due to a server error.",
      // Avoid sending detailed error messages in production
      error:
        process.env.NODE_ENV === "development"
          ? err.message
          : "An unexpected error occurred.",
    });
  } finally {
    if (conn) conn.release();
  }
});

// --- API Endpoint to SOFT DELETE a User ---
// We use the DELETE HTTP verb for semantic correctness, even though it's an UPDATE query.
router.delete("/:userId", async (req, res) => {
  let conn;
  try {
    const { userId } = req.params;

    // Validate the input
    if (!userId || isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "A valid user ID is required.",
      });
    }

    conn = await pool.getConnection();

    // This is the SQL for a soft delete.
    const sql = `
      UPDATE users
      SET delete_status = 'Y'
      WHERE user_id = ? AND delete_status = 'N'
    `;

    const result = await conn.query(sql, [userId]);
    const queryResult = Array.isArray(result) ? result[0] : result;

    // Check if a row was actually updated. If not, the user was already deleted or not found.
    if (queryResult.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found or already deleted.",
      });
    }

    res.status(200).json({
      success: true,
      message: "User has been successfully deleted.",
    });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete user due to a server error.",
    });
  } finally {
    if (conn) conn.release();
  }
});
// --- API Endpoint for User Login ---
router.post("/loginaa", async (req, res) => {
  let conn;
  try {
    const { login_identifier, password } = req.body;

    console.log(login_identifier, password);

    if (!login_identifier || !password) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Email/Phone and password are required.",
        });
    }

    conn = await pool.getConnection();
    const sql = `
      SELECT user_id, full_name, email, password, active_status
      FROM users
      WHERE (email = ? OR phone = ?) AND delete_status = 'N'
        LIMIT 1
    `;
    const [rows] = await conn.query(sql, [login_identifier, login_identifier]);

    if (rows.length === 0) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid login credentials." });
    }

    const user = rows[0];

    if (user.active_status !== "Y") {
      return res
        .status(403)
        .json({
          success: false,
          message: "Your account is inactive. Please contact support.",
        });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid login credentials." });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined in the .env file.");
    }

    const token = jwt.sign(
      { userId: user.user_id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.status(200).json({
      success: true,
      message: "Login successful!",
      token: token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Error during login:", err);
    res
      .status(500)
      .json({ success: false, message: "An internal server error occurred." });
  } finally {
    if (conn) conn.release();
  }
});

// --- API Endpoint for User Login ---
router.post("/loginSSSSS", async (req, res) => {
  let conn;
  try {
    const { login_identifier, password } = req.body;

    if (!login_identifier || !password) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Email/Phone and password are required.",
        });
    }

    conn = await pool.getConnection();
    const sql = `
      SELECT user_id, full_name, email, password, active_status
      FROM users
      WHERE (email = ? OR phone = ?) AND delete_status = 'N'
        LIMIT 1
    `;

    // Using [rows] destructuring is correct here for a SELECT query
    const [rows] = await conn.query(sql, [login_identifier, login_identifier]);

    if (rows.length === 0) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid login credentials." });
    }

    const user = rows[0];

    console.log(rows);

    if (rows[0].active_status !== "Y") {
      return res
        .status(403)
        .json({
          success: false,
          message: "Your account is inactive. Please contact support.",
        });
    }

    const isPasswordMatch = await bcrypt.compare(password, rows[0].password);
    if (!isPasswordMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid login credentials." });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined in the .env file.");
    }

    // Now this line will work correctly because 'jwt' is defined
    const token = jwt.sign(
      { userId: rows[0].user_id, email: rows[0].email },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.status(200).json({
      success: true,
      message: "Login successful!",
      token: token,
      user: {
        user_id: rows[0].user_id,
        full_name: rows[0].full_name,
        email: rows[0].email,
      },
    });
  } catch (err) {
    console.error("Error during login:", err);
    res
      .status(500)
      .json({ success: false, message: "An internal server error occurred." });
  } finally {
    if (conn) conn.release();
  }
});

// --- API Endpoint for User Login ---
router.post("/loginweb", async (req, res) => {
  let conn;
  try {
    const { login_identifier, password } = req.body;

    if (!login_identifier || !password) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Email/Phone and password are required.",
        });
    }

    conn = await pool.getConnection();
    const sql = `
      SELECT user_id, full_name, email, password, active_status
      FROM users
      WHERE (email = ? OR phone = ?) AND delete_status = 'N'
        LIMIT 1
    `;

    // ✅ --- THE FIX IS HERE ---
    // Remove the destructuring brackets []. This ensures 'rows' is always an array.
    const rows = await conn.query(sql, [login_identifier, login_identifier]);

    // Now this check will work correctly.
    if (!rows || rows.length === 0) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid login credentials." });
    }

    // Since the check passed, we know rows[0] is safe to access.
    const user = rows[0];

    if (user.active_status !== "Y") {
      return res
        .status(403)
        .json({
          success: false,
          message: "Your account is inactive. Please contact support.",
        });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid login credentials." });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined in the .env file.");
    }

    const token = jwt.sign(
      { userId: user.user_id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.status(200).json({
      success: true,
      message: "Login successful!",
      token: token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Error during login:", err);
    res
      .status(500)
      .json({ success: false, message: "An internal server error occurred." });
  } finally {
    if (conn) conn.release();
  }
});

// 2. UNIVERSAL LOGIN (Web & Mobile)
// =========================================================================
router.post("/loginNew", async (req, res) => {
  let conn;
  try {
    // 1. Get input (works for both Angular & React Native)
    const { login_identifier, password } = req.body;

    // 2. Validate input
    if (!login_identifier || !password) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Please enter Email/Phone and Password.",
        });
    }

    conn = await pool.getConnection();

    // 3. Find user by Email OR Phone
    const sql = `
      SELECT user_id, full_name, email, phone, password, active_status, profile_photo
      FROM users
      WHERE (email = ? OR phone = ?) AND delete_status = 'N'
      LIMIT 1
    `;

    // Note: Using [rows] because mysql2/promise returns [rows, fields]
    const [rows] = await conn.query(sql, [login_identifier, login_identifier]);

    // 4. Check if user exists
    if (!rows || rows.length === 0) {
      return res
        .status(401)
        .json({
          success: false,
          message: "Invalid credentials. User not found.",
        });
    }

    const user = rows[0];

    // 5. Check if Account is Active
    // if (user.active_status !== 'Y') {
    //   return res.status(403).json({ success: false, message: 'Your account is inactive. Please contact support.' });
    // }

    // 6. Check Password (Bcrypt)
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({
          success: false,
          message: "Invalid credentials. Wrong password.",
        });
    }

    // 7. Generate Token
    // Ensure JWT_SECRET is in your .env file
    const secretKey = process.env.JWT_SECRET || "default_secret_key_change_me";

    const token = jwt.sign(
      { userId: user.user_id, email: user.email, role: "user" },
      secretKey,
      { expiresIn: "24h" },
    );

    // 8. Send Response
    res.status(200).json({
      success: true,
      message: "Login successful!",
      token: token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        profile_photo: user.profile_photo,
      },
    });
  } catch (err) {
    console.error("Login Error:", err);
    res
      .status(500)
      .json({ success: false, message: "Internal server error during login." });
  } finally {
    if (conn) conn.release();
  }
});

// =========================================================================
// UNIVERSAL LOGIN (Web & Mobile) - WITH DEBUGGING
// =========================================================================
router.post("/login", async (req, res) => {
  let conn;
  try {
    const { login_identifier, password } = req.body;

    console.log("1. Login Attempt:", login_identifier); // Debug Log

    if (!login_identifier || !password) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Email/Phone and password are required.",
        });
    }

    conn = await pool.getConnection();

    const sql = `
      SELECT user_id, full_name, email, phone, password, active_status, profile_photo
      FROM users
      WHERE (email = ? OR phone = ?) AND delete_status = 'N'
      LIMIT 1
    `;

    // 1. Get the RAW result from the database
    const result = await conn.query(sql, [login_identifier, login_identifier]);

    // 2. DEBUGGING: Print exactly what the DB sent back
    // (Check your VS Code Terminal to see this output)
    console.log("2. Database Raw Result:", result);

    // 3. UNIVERSAL FIX: Handle both database driver formats
    let rows = [];

    // Check if result is an array and if the first item is ALSO an array
    // This happens in 'mysql2' where result = [rows, fields]
    if (
      Array.isArray(result) &&
      result.length > 0 &&
      Array.isArray(result[0])
    ) {
      rows = result[0];
    } else {
      // This happens in standard 'mysql' where result = rows
      rows = result;
    }

    // 4. Check if we found a user
    if (!rows || rows.length === 0) {
      console.log("3. User not found in DB");
      return res
        .status(401)
        .json({
          success: false,
          message: "Invalid credentials. User not found.",
        });
    }

    // 5. Get the user object
    const user = rows[0];
    console.log("4. Found User:", user.email);

    // 6. Check Active Status
    if (user.active_status !== "Y") {
      return res
        .status(403)
        .json({
          success: false,
          message: "Your account is inactive. Please contact support.",
        });
    }

    // 7. Check Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log("5. Password Mismatch");
      return res
        .status(401)
        .json({
          success: false,
          message: "Invalid credentials. Wrong password.",
        });
    }

    // 8. Generate Token
    const secretKey = process.env.JWT_SECRET || "default_secret_key_change_me";
    const token = jwt.sign(
      { userId: user.user_id, email: user.email, role: "user" },
      secretKey,
      { expiresIn: "24h" },
    );

    // 9. Success Response
    res.status(200).json({
      success: true,
      message: "Login successful!",
      token: token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        profile_photo: user.profile_photo,
      },
    });
  } catch (err) {
    // 🔴 THIS IS WHERE THE ERROR IS PRINTED
    console.error("CRITICAL LOGIN ERROR:", err);
    res
      .status(500)
      .json({ success: false, message: "Internal server error during login." });
  } finally {
    if (conn) conn.release();
  }
});
module.exports = router;
