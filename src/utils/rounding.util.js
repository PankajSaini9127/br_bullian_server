/**
 * Round value to nearest 0.5
 * 0.0 to 0.49 → 0.0
 * 0.5 to 0.99 → 0.5
 */
const roundToHalf = (value) => Math.floor(value * 2) / 2;

module.exports = { roundToHalf };
