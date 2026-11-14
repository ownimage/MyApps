async function mockFlaskApi(page) {
  await page.route("**/solar/api/energy_*", route => {
    const url = new URL(route.request().url());
    const period = url.searchParams.get("period"), value = url.searchParams.get("value");
    const values = {day:["2026-09-15","2026-09-14"],month:["2026-09","2026-08"],year:["2026","2025"]};
    if(url.pathname.endsWith("energy_values")) return route.fulfill({json:{period,values:values[period]}});
    const count = period === "day" ? 145 : period === "year" ? 12 : new Date(Number(value.slice(0,4)),Number(value.slice(5,7)),0).getDate();
    const labels = Array.from({length:count},(_,i)=>period === "day"
      ? String(Math.floor(i*5/60)).padStart(2,"0")+":"+String(i*5%60).padStart(2,"0")
      : value+"-"+String(i+1).padStart(2,"0"));
    const series = {};
    for(const [index,key] of ['grid_import','grid_export','ac_charge','solar','usage'].entries()) {
      series[key] = labels.map((_,i)=>period === "day" ? i*(index+1)/50 : (1+Math.sin(i/3))*(index+1));
    }
    return route.fulfill({json:{period,value,labels,series}});
  });
  await page.route("**/solar/api/power_data*", async (route) => {
    const url = new URL(route.request().url());
    const date = url.searchParams.get("date");
    if (!date) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ dates: ["2026-09-15", "2026-09-14"] })
      });
    }
    const day = date === "2026-09-14"
      ? { date, times: ["06:00:00", "07:00:00"], solar: [0, 100], grid: [500, 400], home: [500, 500], battery: [500, 400], battery_level: [40, 45] }
      : { date, times: ["06:00:00", "07:00:00", "08:00:00"], solar: [0, 100, 300], grid: [500, 400, 300], home: [500, 500, 500], battery: [500, 400, 200], battery_level: [40, 45, 50] };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(day) });
  });

  await page.route("**/solar/api/files*", (route) => {
    route.fulfill({ contentType: "text/plain", body: "mock log line 1\nmock log line 2" });
  });

  await page.route("**/solar/api/run_forecast", (route) => {
    route.fulfill({ contentType: "text/html", body: "mock forecast output" });
  });

  await page.route("**/solar/api/dashboard", route => route.fulfill({json: {
    csrf_token: "TESTCSRF",
    config: {charge_to_percentage: 50},
    settings: [
      {key:"timezone", label:"Timezone", description:"timezone desc", value:"Europe/London", readonly:true},
      {key:"tolerance_percent", label:"Tolerance (%)", description:"tolerance desc", value:0.5, readonly:false, slider:{min:0,max:5,step:0.1}},
      {key:"start_discharge_target", label:"Start Discharge Target (%)", description:"discharge desc", value:90, readonly:false}
    ]
  }}));
  await page.route("**/solar/", route => route.fulfill({contentType:"text/html",body:"saved"}));
}

module.exports = { mockFlaskApi };
