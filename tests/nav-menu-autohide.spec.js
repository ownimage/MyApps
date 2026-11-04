const {test,expect}=require("@playwright/test");
for (const app of ["", "PlanMyDay", "CountMyDays", "QRLinks", "SolarControlar", "FreeFormOX", "ListOfLists", "MyHID", "Storyboard", "Clock"]) {
 test(`${app || "Launch"}: expanded hamburger prevents auto-hide; closing restarts the delay`,async ({page})=>{
  await page.goto(`/${app}${app?"/":""}`);
  const now=new Date();
  await page.clock.install({time:now});
  await page.clock.pauseAt(new Date(now.getTime()+1000));
  await page.evaluate(()=>{
   document.querySelectorAll("smd-page").forEach(p=>p.classList.add("d-none"));
   changeAutoHideMenu(true);
   bootstrap.Dropdown.getOrCreateInstance(document.getElementById("btnMainMenu")).show();
  });
  await page.clock.runFor(4500);
  await expect(page.locator("#mainNav")).not.toHaveClass(/nav-hidden/);
  await expect(page.locator("#btnMainMenu")).toHaveAttribute("aria-expanded","true");
  if (app === "Clock") await page.locator("#btnMainMenu").press("Escape");
  else await page.evaluate(()=>bootstrap.Dropdown.getOrCreateInstance(document.getElementById("btnMainMenu")).hide());
  await page.clock.runFor(3999);
  await expect(page.locator("#mainNav")).not.toHaveClass(/nav-hidden/);
  await page.clock.runFor(1);
  await expect(page.locator("#mainNav")).toHaveClass(/nav-hidden/);
 });
}
