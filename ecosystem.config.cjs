module.exports = {
    apps: [
        {
            name: "loadpulse",
            script: "server/index.js",
            exec_mode: "cluster",
            instances: process.env.PM2_INSTANCES || "max",
        },
    ],
};