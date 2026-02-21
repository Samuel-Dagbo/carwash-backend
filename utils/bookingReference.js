function generateBookingReference() {
  const random = Math.floor(1000 + Math.random() * 9000);
  const stamp = Date.now().toString().slice(-6);
  return `CW-${stamp}-${random}`;
}

module.exports = generateBookingReference;
