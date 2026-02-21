
import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { runSimulation } from './actions'

describe('runSimulation', () => {
  before(() => {
    process.env.NODE_ENV = 'test';
  });

  it('should simulate a simple middleware response', async () => {
    const code = `
      import { NextResponse } from 'next/server'
      export function middleware(request) {
        return NextResponse.json({ message: 'Hello' })
      }
    `
    const requestDetails = {
      url: 'http://localhost:3000/api/test',
      method: 'GET',
      headers: {},
    }

    const result = await runSimulation(code, requestDetails)

    assert.strictEqual(result.status, 200)
    assert.strictEqual(result.type, 'response')
    // Body is a stringified JSON
    assert.ok(result.body.includes('Hello'))
  })

  it('should simulate a middleware rewrite', async () => {
    const code = `
      import { NextResponse } from 'next/server'
      export function middleware(request) {
        return NextResponse.rewrite(new URL('/rewrite', request.url))
      }
    `
    const requestDetails = {
      url: 'http://localhost:3000/original',
      method: 'GET',
      headers: {},
    }

    const result = await runSimulation(code, requestDetails)

    assert.strictEqual(result.type, 'rewrite')
  })

  it('should handle errors in user code', async () => {
    const code = `
      export function middleware(request) {
        throw new Error('Boom')
      }
    `
    const requestDetails = {
      url: 'http://localhost:3000/original',
      method: 'GET',
      headers: {},
    }

    const result = await runSimulation(code, requestDetails)

    assert.strictEqual(result.type, 'error')
    assert.strictEqual(result.error, 'Boom')
  })
})
