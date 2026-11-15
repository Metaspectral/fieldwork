import { clientBundle } from '../../packages/client/tsdown.client.ts'
export default clientBundle(import.meta.dirname, ['src/index.ts'])
