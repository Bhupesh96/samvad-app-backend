require("dotenv").config(); // ✅ MUST be first line

const express = require("express");
const morgan = require("morgan");
const path = require("path");
const app = express();
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// ✅ ADVANCED CUSTOM LOGGER MIDDLEWARE (Logs IN and OUT)
app.use((req, res, next) => {
  console.log(
    `\n➡️ [${new Date().toISOString()}] ${req.method} ${req.originalUrl}`,
  );

  // 1. Log Incoming Data (POST/PUT body)
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("📦 INCOMING BODY:", JSON.stringify(req.body, null, 2));
  }

  // 2. Log Incoming Query Parameters (e.g., ?search=xyz)
  if (req.query && Object.keys(req.query).length > 0) {
    console.log("🔍 INCOMING QUERY:", JSON.stringify(req.query, null, 2));
  }

  // 3. Intercept Outgoing Data (What the server sends back to the app!)
  const originalJson = res.json;
  res.json = function (data) {
    console.log("📤 OUTGOING RESPONSE:");

    // To prevent your terminal from crashing on massive data lists,
    // we limit the log to the first 500 characters
    const stringData = JSON.stringify(data, null, 2);
    console.log(stringData);

    console.log("--------------------------------------------------");

    // Send the actual data to the frontend
    return originalJson.call(this, data);
  };

  next(); // Passes control to the actual route
});

const PORT = 8001;

app.get("/", (req, res) => {
  res.send("Server is running...");
});

// Routes
const prVendorRoutes = require("./routes/pr-mis/vendor");
const prGetMasterRoutes = require("./routes/pr-mis/getmaster");
const prCampaignRoutes = require("./routes/pr-mis/campaign");

app.use("/pr/pr-vendor", prVendorRoutes);
app.use("/pr/pr-master", prGetMasterRoutes);
app.use("/pr/pr-campaign", prCampaignRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
