use smartextract_pdf::run;

use crate::getaway_impl::Gateway;

pub trait ChatGateway {
    // トレイト(共通の振る舞いを定義する)公開する(pub)
    fn send(&self, input: String) -> anyhow::Result<String> {
        run();
    }
}
// 条件付きコンパイルによるビルド時切り替え(デフォルト:Web)
#[cfg(feature = "desktop")]
mod getaway_impl {
    use super::ChatGateway;
    pub struct Gateway;
    impl ChatGateway for Gateway {
        fn send(&self, input: String) -> anyhow::Result<String> {
            Ok(input)
        }
    }
}
#[cfg(feature = "web")]
mod getaway_impl {
    use super::ChatGateway; //ChatGatewayという親のモジュールを呼び出す
    pub struct Gateway;
    impl ChatGateway for Gateway {
        fn send(&self, input: String) -> anyhow::Result<String> {
            Ok(input)
        }
    }
}

fn main() {
    Gateway {};
}
