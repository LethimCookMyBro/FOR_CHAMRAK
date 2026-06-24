"use strict";

const config = require("./lib/runtime-config");
const { startServer } = require("./app");

void startServer({ config }).catch((error) => {
  console.error("start server failed", error);
  process.exit(1);
});
