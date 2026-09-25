import { DataProvider, HttpError } from "react-admin";
export async function api(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, { method, headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new HttpError(result.message || "Ошибка запроса", response.status, result);
  return result;
}
const unsupported = () => Promise.reject(new Error("Это действие пока недоступно"));
const dataProvider: DataProvider = {
  getList: async (resource, params) => {
    const result = await api(`/api/${resource}`);
    let data = result.data;
    if (params.filter?.status) data = data.filter((row: { status: string }) => row.status === params.filter.status);
    if (params.filter?.q) data = data.filter((row: { title?: string; name?: string }) => (row.title || row.name || "").toLowerCase().includes(params.filter.q.toLowerCase()));
    if (params.sort) {
      const { field, order } = params.sort;
      data.sort((a: Record<string, unknown>, b: Record<string, unknown>) => String(a[field]).localeCompare(String(b[field])) * (order === "ASC" ? 1 : -1));
    }
    const total = data.length;
    if (params.pagination) { const { page, perPage } = params.pagination; data = data.slice((page - 1) * perPage, page * perPage); }
    return { data, total };
  },
  getOne: (resource, params) => api(`/api/${resource}/${encodeURIComponent(params.id)}`),
  getMany: async (resource, params) => ({ data: (await api(`/api/${resource}`)).data.filter((row: { id: string }) => params.ids.includes(row.id)) }),
  getManyReference: async (resource) => api(`/api/${resource}`),
  create: (resource, params) => api(`/api/${resource}`, "POST", params.data),
  update: (resource, params) => api(`/api/${resource}/${encodeURIComponent(params.id)}`, "PUT", params.data),
  updateMany: unsupported, delete: unsupported, deleteMany: unsupported,
};
export default dataProvider;
