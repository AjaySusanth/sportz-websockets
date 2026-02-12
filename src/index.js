import express from "express";
import {matchRouter} from './routes/matches.js'


const app = express();
const port = 8000;

app.use(express.json());

app.use('/matches',matchRouter)

app.get("/", (req, res) => {
  res.json({ message: "Server is running" });
});

app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`);
});
