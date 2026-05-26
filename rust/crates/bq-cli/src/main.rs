fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(|s| s.as_str()) {
        Some("smoke") => println!("smoke (stub)"),
        Some("arena") => println!("arena (stub)"),
        _ => {
            eprintln!("usage: bq-cli {{smoke|arena}}");
            std::process::exit(2);
        }
    }
}
