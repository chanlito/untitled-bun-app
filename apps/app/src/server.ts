import index from '../index.html'

const server = Bun.serve({
  port: Number(Bun.env.APP_PORT ?? 3142),
  routes: { '/*': index },
  development: Bun.env.NODE_ENV !== 'production' && { hmr: true, console: true },
})

console.log(`App on ${server.url}`)
