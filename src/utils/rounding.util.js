/**
 * Round value to nearest 0.5
 * 0.00 to 0.44 → 0.0
 * 0.45 to 0.89 → 0.5
 * 0.90 to 0.99 → +1 (next integer)
 */
const roundToHalf = (value) => {
  const floor = Math.floor(value);
  const decimal = value - floor;
  if (decimal < 0.45) return floor;
  if (decimal < 0.9) return floor + 0.5;
  return floor + 1;
};

module.exports = { roundToHalf };
