import { Router } from "express";
import { submitClaim, authorizeDisbursement } from "../controllers/dispatcherController.js";

const router = Router();

router.post("/triage/submit", submitClaim);
router.post("/triage/authorize", authorizeDisbursement);

export default router;