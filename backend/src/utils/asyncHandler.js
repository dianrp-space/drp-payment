/**
 * Wrap async controller agar rejection otomatis diteruskan ke error middleware.
 * @param {(req, res, next) => Promise<any>} fn
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
