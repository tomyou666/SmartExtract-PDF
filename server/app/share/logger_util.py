import inspect
import logging
import logging.handlers
import os
from functools import wraps
from pathlib import Path

from app.share import const


def is_debug() -> bool:
    """デバッグモードか判断する.循環参照回避のため直接isDebug関数を記述.

    Returns
    -------
        bool: true:デバッグモード

    """
    return os.getenv(const.IS_DEBUG) == "TRUE"


class CustomFilter(logging.Filter):
    """logger用のユーザー定義フィルター."""

    def filter(self, record):
        """呼び出し元のファイル名、関数名、行番号が表示されるようにする関数\n
        これでフィルタリングしないとデコレーターを使用した関数(呼び出し元)に関する情報ではなく、\n
        test1.pyの後述のlog関数を元にした情報が出力される.

        Returns
        -------
            True: 常にフィルターをパスする

        """
        record.real_filename = getattr(record, "real_filename", record.filename)
        record.real_funcName = getattr(record, "real_funcName", record.funcName)
        record.real_lineno = getattr(record, "real_lineno", record.lineno)
        return True


def get_logger() -> logging.Logger:
    """logging.Loggerの作成.

    Returns
    -------
        logger (logging.Logger): logging.Loggerのインスタンス

    """
    log_format = "[%(asctime)s] %(levelname)s\t%(real_filename)s - %(real_funcName)s:%(real_lineno)s -> %(message)s"
    level = logging.DEBUG if is_debug() else logging.INFO
    if not Path(const.LOG_DIR).exists():
        Path(const.LOG_DIR).mkdir(parents=True)

    logger = logging.getLogger(__name__)
    logger.setLevel(level)
    logger.addFilter(CustomFilter())
    if len(logger.handlers) <= 0:
        file_handler = logging.handlers.RotatingFileHandler(
            filename=const.LOG_PATH,
            maxBytes=const.LOG_MAX_BYTE,
            backupCount=9,
            encoding="utf-8",
        )
        file_handler.setLevel(level)
        file_handler.setFormatter(logging.Formatter(log_format))
        logger.addHandler(file_handler)

        stream_handler = logging.StreamHandler()
        stream_handler.setLevel(level)
        stream_handler.setFormatter(logging.Formatter(log_format))
        logger.addHandler(stream_handler)

    return logger


def log(logger: logging.Logger, custom_message=""):
    """デコレーターでloggerを引数にとるためのラッパー関数.

    Args:
    ----
        logger (logging.Logger): ロガー
        custom_message (str, optional): ログに追記する内容 Defaults to "".

    Returns:
    -------
        _decoratorの返り値

    """

    def _decorator(func):
        """デコレーターを使用する関数を引数とする.

        Args:
        ----
            func (function): 関数

        Returns:
        -------
            wrapperの返り値

        """

        # funcのメタデータを引き継ぐ
        @wraps(func)
        def wrapper(*args, **kwargs):
            """実際の処理を書くための関数.

            Args:
            ----
                *args, **kwargs: funcの引数

            Returns:
            -------
                funcの返り値

            """
            func_name = func.__name__
            # loggerで使用するためにfuncに関する情報をdict化
            extra = {
                "real_filename": inspect.getfile(func),
                "real_funcName": func_name,
                "real_lineno": inspect.currentframe().f_back.f_lineno,  # type: ignore
            }

            logger.info(f"[START]: {func_name}: {custom_message}", extra=extra)

            try:
                # funcの実行
                ret_val = func(*args, **kwargs)
            except Exception:
                # funcのエラーハンドリング
                logger.error(f"[KILLED] {func_name}: {custom_message}", extra=extra)
                raise
            finally:
                logger.info(f"[END] {func_name}: {custom_message}", extra=extra)

            return ret_val

        return wrapper

    return _decorator


def log_exceptions(logger: logging.Logger):
    """メソッドのエラーをロギングする.

    >>> @log_exceptions(logger)
        def sample:
            // メソッドのエラーをロギングする
            raise Error("testError")
    """

    def _decorator(func):
        """デコレーターを使用する関数を引数とする.

        Args:
        ----
            func (function)

        Returns:
        -------
            wrapperの返り値

        """

        # funcのメタデータを引き継ぐ
        @wraps(func)
        def wrapper(*args, **kwargs):
            """実際の処理を書くための関数.

            Args:
            ----
                *args, **kwargs: funcの引数

            Returns:
            -------
                funcの返り値

            """
            try:
                return func(*args, **kwargs)
            except Exception as e:
                logger.exception(e)
                raise

        return wrapper

    return _decorator
