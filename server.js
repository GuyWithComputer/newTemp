// server.js
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Enable CORS for all routes
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Store recent coordinates and images
let coordinateHistory = [];
let imageHistory = [];
let bannerDataHistory = [];  // Add a new array to store banner data
const MAX_HISTORY_LENGTH = 100;
// Removed the MAX_IMAGE_HISTORY limit to allow unlimited images

// Socket.IO connection
io.on("connection", (socket) => {
  console.log("Client connected");

  // Send existing history to new client
  if (coordinateHistory.length > 0) {
    socket.emit("coordinate-history", coordinateHistory);
  }

  // Send existing image history
  if (imageHistory.length > 0) {
    socket.emit("image-history", imageHistory);
  }

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// API endpoint to receive coordinates
app.post("/api/coordinates", (req, res) => {
  const { coordinates } = req.body;

  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
    return res.status(400).json({
      error:
        "Invalid coordinates format. Expected [distance, x, z, photoCapture]",
    });
  }

  const [distance, x, z, photoCapture = 0] = coordinates;

  // Validate coordinate values
  if (
    typeof distance !== "number" ||
    typeof x !== "number" ||
    typeof z !== "number"
  ) {
    return res
      .status(400)
      .json({ error: "All coordinate values must be numbers" });
  }

  // Validate photo capture value (if provided)
  if (photoCapture !== undefined && ![0, 1].includes(photoCapture)) {
    return res
      .status(400)
      .json({ error: "Photo capture value must be 0 or 1" });
  }

  console.log(
    `Received coordinates: distance=${distance}, x=${x}, z=${z}, photo=${photoCapture}`
  );

  // Process and store the coordinates
  const coordinateData = {
    distance,
    x,
    z,
    photoCapture: photoCapture || 0,
    timestamp: Date.now(),
  };

  coordinateHistory.push(coordinateData);
  if (coordinateHistory.length > MAX_HISTORY_LENGTH) {
    coordinateHistory.shift();
  }

  // Broadcast to all connected clients
  io.emit("new-coordinate", coordinateData);

  res.json({ status: "success", message: "Coordinates received" });
});

// API endpoint to receive image links
app.post("/api/image", (req, res) => {
  const { imageUrl, metadata } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: "No image URL provided" });
  }

  console.log(`Received image URL: ${imageUrl}`);

  // Create image data object
  const imageData = {
    url: imageUrl,
    metadata: metadata || {},
    timestamp: Date.now(),
  };

  // Add to history without removing older images
  imageHistory.unshift(imageData); // Add to beginning so newest is first

  // Broadcast to all connected clients
  io.emit("new-image", imageData);
  io.emit("image-history", imageHistory);

  res.json({ status: "success", message: "Image URL received" });
});

app.post("/api/banner_data", async (req, res) => {
  try {
    const { imageUrl, brand, position, type } = req.body; // Extract data from the request

    if (!imageUrl || !brand || !position || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    const bannerData = {
      imageUrl,
      brand,
      position,
      type,
      timestamp: Date.now(),
    };
    
    console.log("Received banner data:", bannerData);
    
    // Store the banner data
    bannerDataHistory.push(bannerData);
    
    // Update the corresponding image with the banner data
    const imageIndex = imageHistory.findIndex(img => img.url === imageUrl);
    if (imageIndex !== -1) {
      imageHistory[imageIndex].metadata.bannerData = bannerData;
      
      // Notify all clients about the updated image
      io.emit("image-history", imageHistory);
    }

    res.status(201).json({ message: "Banner data received", data: bannerData });
  } catch (error) {
    console.error("Error processing banner data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all coordinates
app.get("/api/coordinates", (req, res) => {
  res.json(coordinateHistory);
});

// Get all images
app.get("/api/images", (req, res) => {
  res.json(imageHistory);
});

// Get all banner data
app.get("/api/banner_data", (req, res) => {
  res.json(bannerDataHistory);
});

// Get banner data for a specific image
app.get("/api/banner_data/:imageUrl", (req, res) => {
  const { imageUrl } = req.params;
  const data = bannerDataHistory.find(item => item.imageUrl === imageUrl);
  
  if (data) {
    res.json(data);
  } else {
    res.status(404).json({ error: "No banner data found for this image" });
  }
});

// Clear all coordinates and images
app.delete("/api/coordinates", (req, res) => {
  coordinateHistory = [];
  io.emit("coordinates-cleared");
  res.json({ status: "success", message: "Coordinates cleared" });
});

app.delete("/api/images", (req, res) => {
  imageHistory = [];
  io.emit("images-cleared");
  res.json({ status: "success", message: "Images cleared" });
});

// Clear everything
app.delete("/api/all", (req, res) => {
  coordinateHistory = [];
  imageHistory = [];
  bannerDataHistory = [];  // Also clear banner data
  io.emit("coordinates-cleared");
  io.emit("images-cleared");
  res.json({ status: "success", message: "All data cleared" });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
