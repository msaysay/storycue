const prefix=process.env.STORYCUE_BASE_PATH||'';
export default {basePath:prefix,env:{NEXT_PUBLIC_STORYCUE_BASE_PATH:prefix},experimental:{cpus:1},serverExternalPackages:['ws','bufferutil','utf-8-validate']};
