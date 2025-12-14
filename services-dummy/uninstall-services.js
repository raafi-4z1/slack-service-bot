const { Service } = require("node-windows");

// Daftar service dummy kamu
const services = [
  { name: "elasticsearch", description: "Dummy Elasticsearch Service" },
  { name: "kibana",        description: "Dummy Kibana Service" },
  { name: "filebeat-service", description: "Dummy Filebeat Service" },
];

services.forEach(svc => {
  const service = new Service({
    name: svc.name,
    script: "...\\slack-service-bot\\services-dummy\\dummy.js"
  });

  service.on("uninstall", () => {
    console.log(`Uninstalled: ${svc.name}`);
  });

  console.log(`Removing ${svc.name}...`);
  service.uninstall();
});
