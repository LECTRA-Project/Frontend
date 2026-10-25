import { apiClient } from "./client.js";

/*
  Thin helpers over the axios client. They return the response body (`data`) directly,
  so services don't have to unwrap `response.data` every time.

  `config` is any axios request config — e.g. { params, headers, signal }.
*/
export async function get(url, config) {
  const response = await apiClient.get(url, config);
  return response.data;
}

export async function post(url, body, config) {
  const response = await apiClient.post(url, body, config);
  return response.data;
}

export async function put(url, body, config) {
  const response = await apiClient.put(url, body, config);
  return response.data;
}

export async function patch(url, body, config) {
  const response = await apiClient.patch(url, body, config);
  return response.data;
}

export async function del(url, config) {
  const response = await apiClient.delete(url, config);
  return response.data;
}
