// Own module so tests can mock it: jsdom's `location.reload` can't be spied on.
export const reloadPage = () => {
  window.location.reload();
};
