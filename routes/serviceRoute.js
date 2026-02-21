const express = require("express");
const router = express.Router();
const multer = require("multer");
const sharp = require("sharp");
const Service = require("../models/Service");
const adminAuth = require("../middleware/authMiddleware");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    return cb(null, true);
  },
});

const buildImageUrl = (req, serviceId) =>
  `${req.protocol}://${req.get("host")}/api/services/${serviceId}/image`;

const serializeService = (service, req) => {
  const plain = service.toObject();
  delete plain.imageData;
  delete plain.imageMimeType;
  return {
    ...plain,
    hasImage: Boolean(service.imageData),
    imageUrl: service.imageData ? buildImageUrl(req, service._id) : null,
  };
};

async function compressImageIfProvided(file) {
  if (!file) return null;
  const buffer = await sharp(file.buffer)
    .rotate()
    .resize({ width: 960, withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
  return {
    imageData: buffer,
    imageMimeType: "image/jpeg",
  };
}

// GET all services
router.get("/", async (req, res) => {
  try {
    const activeQuery = req.query.active;
    const filter = activeQuery === "all" ? {} : { isActive: true };
    const services = await Service.find(filter).sort({ createdAt: -1 });
    return res.json(services.map((service) => serializeService(service, req)));
  } catch (error) {
    return res.status(500).json({ message: "Failed to load services" });
  }
});

// GET service image
router.get("/:id/image", async (req, res) => {
  try {
    const service = await Service.findById(req.params.id).select("imageData imageMimeType");
    if (!service || !service.imageData) {
      return res.status(404).json({ message: "Service image not found" });
    }
    res.set("Content-Type", service.imageMimeType || "image/jpeg");
    return res.send(service.imageData);
  } catch (error) {
    return res.status(500).json({ message: "Failed to load service image" });
  }
});

// CREATE service
router.post("/", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const { name, description, price, duration } = req.body || {};

    if (!name || !description || price === undefined || !duration) {
      return res.status(400).json({ message: "Name, description, price and duration are required" });
    }

    const service = new Service({
      name: name.trim(),
      description: description.trim(),
      price: Number(price),
      duration: Number(duration),
      isActive: true,
    });

    const compressed = await compressImageIfProvided(req.file);
    if (compressed) {
      service.imageData = compressed.imageData;
      service.imageMimeType = compressed.imageMimeType;
    }

    const created = await service.save();
    return res.status(201).json(serializeService(created, req));
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to create service" });
  }
});

// UPDATE service
router.put("/:id", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const updates = req.body || {};
    if (updates.price !== undefined) updates.price = Number(updates.price);
    if (updates.duration !== undefined) updates.duration = Number(updates.duration);

    if (req.file) {
      const compressed = await compressImageIfProvided(req.file);
      updates.imageData = compressed.imageData;
      updates.imageMimeType = compressed.imageMimeType;
    }

    if (String(updates.clearImage).toLowerCase() === "true") {
      updates.imageData = undefined;
      updates.imageMimeType = undefined;
    }

    const service = await Service.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    return res.json(serializeService(service, req));
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to update service" });
  }
});

// DEACTIVATE service
router.patch("/:id/deactivate", adminAuth, async (req, res) => {
  try {
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    return res.json(serializeService(service, req));
  } catch (error) {
    return res.status(500).json({ message: "Failed to deactivate service" });
  }
});

// ACTIVATE service
router.patch("/:id/activate", adminAuth, async (req, res) => {
  try {
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true }
    );

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    return res.json(serializeService(service, req));
  } catch (error) {
    return res.status(500).json({ message: "Failed to activate service" });
  }
});

module.exports = router;
