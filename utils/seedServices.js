const Service = require("../models/Service");

const defaultServices = [
  {
    name: "Basic Wash",
    description: "Exterior wash and rinse",
    price: 15,
    duration: 30,
    isActive: true,
  },
  {
    name: "Premium Wash",
    description: "Full wash plus interior cleaning",
    price: 25,
    duration: 45,
    isActive: true,
  },
  {
    name: "Deluxe Wash",
    description: "Complete detailing service",
    price: 40,
    duration: 60,
    isActive: true,
  },
];

async function seedServicesIfEmpty() {
  const count = await Service.countDocuments();
  if (count > 0) return;
  await Service.insertMany(defaultServices);
  console.log("Seeded starter services");
}

module.exports = seedServicesIfEmpty;
