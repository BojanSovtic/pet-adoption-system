import express from 'express';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3333;

const app = express();

// Middleware
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.send({ message: 'ok' });
});

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});
