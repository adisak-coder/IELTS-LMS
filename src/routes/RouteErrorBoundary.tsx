import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

import { ErrorSurface } from '../components/ui/ErrorSurface';

function getRouteErrorDescription(error: unknown) {
  if (isRouteErrorResponse(error)) {
    return error.statusText || `Request failed with status ${error.status}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'An unexpected routing error occurred.';
}

export function RouteErrorBoundary() {
  const error = useRouteError();

  return (
    <ErrorSurface
      title="Something went wrong"
      description={getRouteErrorDescription(error)}
      actionLabel="Reload"
      onAction={() => {
        window.location.reload();
      }}
    />
  );
}
