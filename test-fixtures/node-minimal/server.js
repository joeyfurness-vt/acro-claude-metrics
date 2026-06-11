import express from 'express';
const app = express();
app.get('/', (_, r) => r.send('hello'));
app.listen(3000, () => console.log('fixture listening on 3000'));
