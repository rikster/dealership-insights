import app from "./index.js";
const port = Number(process.env.API_PORT ?? 3001);

app.listen({ port, host: "0.0.0.0" }).catch((error: unknown) => {
  app.log.error(error);
  process.exitCode = 1;
});
