"use strict";

function getClientIp(req) {
  const rawIp = String(req?.ip || req?.socket?.remoteAddress || "unknown").trim();
  const normalizedIp = rawIp.startsWith("::ffff:") ? rawIp.slice(7) : rawIp;
  return normalizedIp || "unknown";
}

module.exports = {
  getClientIp
};
