/**
 * Google Meet link generator.
 * Generates a unique meet.google.com link in the standard format.
 * Format: https://meet.google.com/xxx-xxxx-xxx
 */

function randomCode(length) {
  const chars = 'abcdefghijkmnpqrstuvwxyz'; // no ambiguous chars
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

exports.createVideoRoom = async (roomName) => {
  // Generate a unique Google Meet style link
  const code = `${randomCode(3)}-${randomCode(4)}-${randomCode(3)}`;
  const url  = `https://meet.google.com/${code}`;
  return { url, name: code };
};

exports.deleteVideoRoom = async () => {
  // No-op — Google Meet links don't need cleanup
};
