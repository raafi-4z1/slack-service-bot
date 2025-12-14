const { Service } = require("node-windows");

const services = [
  { name: "elasticsearch", description: "Dummy Elasticsearch Service" },
  { name: "kibana",        description: "Dummy Kibana Service" },
  { name: "filebeat-service", description: "Dummy Filebeat Service" },
];

function installSequential(index = 0) {
  if (index >= services.length) {
    console.log("✔ All services installed successfully");
    return;
  }

  const svc = services[index];
  const service = new Service({
    name: svc.name,
    description: svc.description,
    script: "C:\\Users\\901102\\Music\\slack-service-bot\\services-dummy\\dummy.js"
  });

  service.on("install", () => {
    console.log(`✔ Installed: ${svc.name}`);
    service.start();
    installSequential(index + 1); // lanjut install berikutnya
  });

  service.on("alreadyinstalled", () => {
    console.log(`ℹ Already installed: ${svc.name}`);
    installSequential(index + 1);
  });

  service.on("error", (err) => {
    console.log(`❌ Error installing ${svc.name}:`, err);
    installSequential(index + 1); // tetap lanjut
  });

  console.log(`⏳ Installing ${svc.name}...`);
  service.install();
}

installSequential();
