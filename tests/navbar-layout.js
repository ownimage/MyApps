async function settledSpacing(page) {
  return page.evaluate(() => {
    const nav = document.getElementById('mainNav');
    const content = document.querySelector('#mainNav + .container-fluid');
    // This tests layout endpoints, not animation timing. Flush the class change
    // before finishing its CSS transitions, including delayed/paused transitions.
    getComputedStyle(content).paddingTop;
    getComputedStyle(nav).transform;
    for (const element of [nav, content]) {
      for (const animation of element.getAnimations()) animation.finish();
    }
    return {
      navPosition: getComputedStyle(nav).position,
      navBottom: nav.getBoundingClientRect().bottom,
      marginBottom: parseFloat(getComputedStyle(nav).marginBottom),
      paddingTop: parseFloat(getComputedStyle(content).paddingTop)
    };
  });
}

module.exports = { settledSpacing };
