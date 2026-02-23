import { expect, test as base } from "@playwright/test";

const mockApiBaseUrl = process.env.PLAYWRIGHT_MOCK_API_BASE_URL ?? "http://127.0.0.1:4100";

type TestFixtures = {
  resetMockApi: void;
};

export const test = base.extend<TestFixtures>({
  resetMockApi: [
    async ({ request }, use) => {
      const response = await request.post(`${mockApiBaseUrl}/__test/reset`);
      expect(response.ok()).toBeTruthy();
      await use();
    },
    { auto: true }
  ]
});

export { expect };
