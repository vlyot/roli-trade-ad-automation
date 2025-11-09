// trade_ad.rs — facade module that adapts to the repository layout where
// the single-responsibility modules were placed at the crate root with
// hyphenated filenames. Rust module identifiers cannot contain hyphens,
// so we include those files into properly-named submodules and re-export
// the public functions used by the rest of the crate.

// Include request-search-roli.rs into a valid Rust module name `request_search_roli`.
pub mod request_search_roli {
    include!("request_search_roli.rs");
}
pub use request_search_roli::fetch_item_details;

// Include post-trade-ad.rs into a valid Rust module name `post_trade_ad`.
pub mod post_trade_ad {
    include!("post_trade_ad.rs");
}
pub use post_trade_ad::post_trade_ad_direct;

// Include thumbnails helper module
pub mod thumbnails {
    include!("thumbnails.rs");
}
// thumbnails helper available as `crate::trade_ad::thumbnails::fetch_thumbnails_map`
