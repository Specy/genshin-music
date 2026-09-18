import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';

// The partners CONTENT lives inline on the blog index now (pages-polish spec §7.2 + its
// 2026-08-22 redirect revision) — this route exists only so old /partners deep links land
// there instead of on a 404. Every route prerenders (+layout.ts) and no runtime server
// exists to send a real 301, so at build time this becomes a meta-refresh page; in-app
// navigations take the router's redirect directly.
export const load = () => {
  redirect(301, `${base}/blog`);
};
