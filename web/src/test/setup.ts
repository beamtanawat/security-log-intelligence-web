import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// The session analysis list lives in sessionStorage; isolate tests from each other.
afterEach(() => sessionStorage.clear());
