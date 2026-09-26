// Aliases over the generated schema (npm run gen:types) so types can't drift from the Pydantic models.
import type { components } from './api-schema';

type S = components['schemas'];

export type User = S['UserOut'];
export type Role = User['role'];
export type Warehouse = S['WarehouseOut'];
export type Location = S['LocationOut'];
export type Product = S['ProductOut'];
export type Quant = S['QuantOut'];
export type Operation = S['OperationOut'];
export type OperationDetail = S['OperationDetail'];
export type OpType = Operation['type'];
export type OpStatus = Operation['status'];
export type Move = S['MoveOut'];
export type LedgerEntry = S['LedgerOut'];
export type Dashboard = S['DashboardOut'];
export type OpCounts = S['OpCounts'];

/** WebSocket payload, see app/ws.py in the backend. */
export type WsEvent = { type: 'operation.created' | 'operation.transitioned'; operationId: number; newState: OpStatus };
