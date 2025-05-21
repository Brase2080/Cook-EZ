import express from 'express'
import authRouter from './routes/auth-routes.js'

const app = express()
const PORT = 3000

app.set('view engine', 'ejs')

app.get('/', (req, res) => {
    res.render('home')
})

app.use('/auth', authRouter)


app.listen(PORT, () => {
    console.log('Launched on http://localhost:'+PORT)
})