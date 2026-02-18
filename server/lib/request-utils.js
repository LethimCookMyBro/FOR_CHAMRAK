"use strict";

const { sanitizeText } = require("./helpers");

function createRequestUtils(activityLogs) {
  function getActor(req) {
    return {
      username: sanitizeText(req.auth?.username || "anonymous", 80),
      ip: sanitizeText(req.ip || "-", 120)
    };
  }

  async function writeAudit(payload) {
    try {
      await activityLogs.append(payload);
    } catch (error) {
      console.error("write audit failed", error);
    }
  }

  return {
    getActor,
    writeAudit
  };
}

module.exports = {
  createRequestUtils
};
