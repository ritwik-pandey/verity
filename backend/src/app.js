import express from "express";
import cors from "cors";
import routes from "./routes/index.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "15mb" })); // room for base64 images

  app.use("/api", routes);

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  return app;
}