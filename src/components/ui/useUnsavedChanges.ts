import { useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";
export function useUnsavedChanges(dirty: boolean) {
  const handling = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    if (blocker.state !== "blocked") {
      handling.current = false;
      return;
    }
    if (handling.current) return;
    handling.current = true;
    if (window.confirm("Há alterações não salvas. Deseja sair e descartá-las?"))
      blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const switchContext = (event: Event) => {
      if (
        !window.confirm("Há alterações não salvas. Deseja sair e descartá-las?")
      )
        event.preventDefault();
    };
    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest?.("a[href]");
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      if (anchor.href === window.location.href) return;
      // The router handles internal links and back/forward navigation.
      if (anchor.origin === window.location.origin) return;
      if (
        anchor.pathname === window.location.pathname &&
        anchor.search === window.location.search
      )
        return;
      if (
        !window.confirm("Há alterações não salvas. Deseja sair e descartá-las?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("stockpro:before-navigation", switchContext);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("stockpro:before-navigation", switchContext);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty]);
}
