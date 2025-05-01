import { Application, Router } from "@oak/oak";
import * as notes from "./controllers/note.ts";
import { changeEmail } from "./controllers/changeEmail.ts";
import { initializeServices } from "./config/serviceSetup.ts";
import { corsMiddleware } from "./middleware/cors.ts";
import { authMiddleware } from "./middleware/auth.ts";
import {
  requestSizeLimiter,
  requestTracingMiddleware,
} from "./middleware/requests.ts";
import { changePassword } from "./controllers/changePassword.ts";
import {
  disableTwoFactor,
  enableTwoFactor,
  verifyTwoFactor,
} from "./controllers/twoFactor.ts";
import { login, withRecovery, withTwoFactor } from "./controllers/login.ts";
import { getProfile } from "./controllers/profile.ts";
import { logout } from "./controllers/logout.ts";
import { register } from "./controllers/registration.ts";

initializeServices();

// Public
const publicRouter = new Router();
// Registration
publicRouter.post("/api/register", register);
// Login
publicRouter.post("/api/login", login);
publicRouter.post("/api/login/2fa/verify", withTwoFactor);
publicRouter.post("/api/login/2fa/recovery", withRecovery);

// Protected
const protectedRouter = new Router();
// Profile
protectedRouter.get("/api/:userId/profile", getProfile);

//Logout
protectedRouter.post("/api/logout", logout);

// Changes
protectedRouter.put(
  "/api/:userId/change-email",
  changeEmail,
);
protectedRouter.put("/api/:userId/change-password", changePassword);

// 2FA
protectedRouter.post("/api/:userId/2fa/setup", enableTwoFactor);
protectedRouter.post("/api/:userId/2fa/verify", verifyTwoFactor);
protectedRouter.post("/api/:userId/2fa/disable", disableTwoFactor);
// Notes
protectedRouter.get("/api/:userId/notes/search", notes.searchNotes);
protectedRouter.put("/api/:userId/notes/create", notes.newNote);
protectedRouter.put("/api/:userId/note/:id/update", notes.updateNote);
protectedRouter.delete(
  "/api/:userId/note/:id/delete",
  notes.deleteNote,
);
protectedRouter.get("/api/:userId/note/:id", notes.showSingleNote);
protectedRouter.get("/api/:userId/notes", notes.showAllNotes);
protectedRouter.put("/api/:userId/note/:id/pin", notes.pinNote);
protectedRouter.put(
  "/api/:userId/note/:id/pin/position",
  notes.updatePinPosition,
);
protectedRouter.get("/api/:userId/notes/tags", notes.showNoteTags);
protectedRouter.get("/api/:userId/notes/names", notes.showNoteNames);

// App setup
const app = new Application();

app.use(corsMiddleware);
app.use(requestTracingMiddleware);
app.use(requestSizeLimiter(1024 * 1024));

app.use(publicRouter.routes());
app.use(publicRouter.allowedMethods());

app.use(authMiddleware);
app.use(protectedRouter.routes());
app.use(protectedRouter.allowedMethods());

console.log("Server running on http://localhost:1004");
await app.listen({ port: 1004 });
