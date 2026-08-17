export default {
  async fetch(request, env) {
    return new Response("3c-production-manager: worker is live", { status: 200 });
  }
};
