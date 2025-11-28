const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const apiRoutes = require('./routes/api');

dotenv.config();
const app = express();

app.use(express.json());
// Allow configurable frontend origin via FRONTEND_ORIGIN env var. If not set, allow all origins (useful for quick testing).
const frontendOrigin = process.env.FRONTEND_ORIGIN;
if (frontendOrigin) {
  app.use(cors({ origin: frontendOrigin }));
  console.log('CORS enabled for origin:', frontendOrigin);
} else {
  app.use(cors({ origin: true }));
  console.log('CORS enabled for any origin (testing)');
}

app.use('/api', apiRoutes);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Exam seating backend listening on port ${port}`);
});
