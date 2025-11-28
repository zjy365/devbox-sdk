use axum::{extract::Request, middleware::Next, response::Response};
use std::time::Instant;

pub async fn logging_middleware(req: Request, next: Next) -> Response {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let start = Instant::now();

    let response = next.run(req).await;

    let duration = start.elapsed();
    let status = response.status();

    println!("{} {} {} {:?}", method, uri, status, duration);

    response
}
