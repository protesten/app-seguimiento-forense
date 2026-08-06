"""
Adaptado de la libreria "invisible-watermark" (https://github.com/ShieldMnt/invisible-watermark),
archivo imwatermark/dwtDctSvd.py. Licencia MIT, Copyright (c) 2021 ShieldMnt.

Copiado aqui tal cual (sin cambios en la logica de marcado) para no depender del
paquete completo: su __init__.py importa incondicionalmente su metodo "rivaGan",
que arrastra "torch" (~500MB en disco, ~250MB de RAM solo con importarlo) aunque
nunca lo usemos -- en esta app solo usamos el metodo "dwtDctSvd", implementado
aqui, que no necesita torch en absoluto.
"""

import cv2
import numpy as np
import pywt


class EmbedDwtDctSvd:
    def __init__(self, watermarks=None, wmLen=8, scales=(0, 36, 0), block=4):
        self._watermarks = watermarks if watermarks is not None else []
        self._wmLen = wmLen
        self._scales = scales
        self._block = block

    def encode(self, bgr):
        (row, col, _channels) = bgr.shape

        yuv = cv2.cvtColor(bgr, cv2.COLOR_BGR2YUV)

        for channel in range(2):
            if self._scales[channel] <= 0:
                continue

            ca1, (h1, v1, d1) = pywt.dwt2(yuv[: row // 4 * 4, : col // 4 * 4, channel], "haar")
            self.encode_frame(ca1, self._scales[channel])

            yuv[: row // 4 * 4, : col // 4 * 4, channel] = pywt.idwt2((ca1, (v1, h1, d1)), "haar")

        return cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR)

    def decode(self, bgr):
        (row, col, _channels) = bgr.shape

        yuv = cv2.cvtColor(bgr, cv2.COLOR_BGR2YUV)

        scores = [[] for _ in range(self._wmLen)]
        for channel in range(2):
            if self._scales[channel] <= 0:
                continue

            ca1, (h1, v1, d1) = pywt.dwt2(yuv[: row // 4 * 4, : col // 4 * 4, channel], "haar")
            scores = self.decode_frame(ca1, self._scales[channel], scores)

        avg_scores = list(map(lambda l: np.array(l).mean(), scores))
        return np.array(avg_scores) * 255 > 127

    def decode_frame(self, frame, scale, scores):
        (row, col) = frame.shape
        num = 0

        for i in range(row // self._block):
            for j in range(col // self._block):
                block = frame[i * self._block : i * self._block + self._block, j * self._block : j * self._block + self._block]
                score = self.infer_dct_svd(block, scale)
                wm_bit = num % self._wmLen
                scores[wm_bit].append(score)
                num += 1

        return scores

    def diffuse_dct_svd(self, block, wm_bit, scale):
        u, s, v = np.linalg.svd(cv2.dct(block))
        s[0] = (s[0] // scale + 0.25 + 0.5 * wm_bit) * scale
        return cv2.idct(np.dot(u, np.dot(np.diag(s), v)))

    def infer_dct_svd(self, block, scale):
        _u, s, _v = np.linalg.svd(cv2.dct(block))
        return int((s[0] % scale) > scale * 0.5)

    def encode_frame(self, frame, scale):
        (row, col) = frame.shape
        num = 0
        for i in range(row // self._block):
            for j in range(col // self._block):
                block = frame[i * self._block : i * self._block + self._block, j * self._block : j * self._block + self._block]
                wm_bit = self._watermarks[num % self._wmLen]

                diffused_block = self.diffuse_dct_svd(block, wm_bit, scale)
                frame[i * self._block : i * self._block + self._block, j * self._block : j * self._block + self._block] = diffused_block

                num += 1
