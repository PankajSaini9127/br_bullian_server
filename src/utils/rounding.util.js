/**
 * Round value to nearest 0.5
 * 0.0 to 0.4 → 0.0
 * 0.5 to 0.9 → 0.5
 */
const roundToHalf = (value) => Math.floor(value * 2) / 2;

module.exports = { roundToHalf };
