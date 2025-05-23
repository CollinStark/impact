from collections import deque

import numpy as np
from scipy.spatial.distance import euclidean


class MIDAligner:
    class MC:
        def __init__(self, mean_distance, sd_distance):
            self.mean_distance = mean_distance
            self.sd_distance = sd_distance

    mc_models = {}

    def __init__(self, v1, v2, distance, zvalue):
        self.v1 = v1
        self.v2 = v2
        self.distance = distance
        self.zvalue = zvalue

    @staticmethod
    def align_MIDs(mid1, mid2, gap_pen=0.2):
        v1, v2, distance = MIDAligner.align_vectors(mid1, mid2, gap_pen)
        z = MIDAligner.calculate_zvalue(len(mid1), len(mid2), distance, gap_pen)
        return MIDAligner(v1, v2, distance, z)

    @staticmethod
    def clear_cache():
        MIDAligner.mc_models = {}

    def get_mid1(self):
        return self.v1

    def get_mid2(self):
        return self.v2

    def get_distance(self):
        return self.distance

    def get_zvalue(self):
        return self.zvalue

    @staticmethod
    def align_vectors(mid1, mid2, gap_pen):
        if len(mid1) < 1 or len(mid2) < 1:
            raise Exception("MID vectors must have at least one dimension")

        s_x = len(mid1) + 1
        s_y = len(mid2) + 1
        mat_score = np.zeros((s_x, s_y))
        mat_trace = np.empty((s_x, s_y), dtype=object)

        mat_score[1:, 0] = np.arange(1, s_x) * gap_pen
        mat_score[0, 1:] = np.arange(1, s_y) * gap_pen
        mat_trace[1:, 0] = "LEFT"
        mat_trace[0, 1:] = "UP"

        for y in range(1, s_y):
            for x in range(1, s_x):
                s = abs(mid1[x - 1] - mid2[y - 1])
                s_diag = mat_score[x - 1, y - 1] + s
                s_up = (
                    mat_score[x, y - 1] + (abs(x - y) + 1) * gap_pen + abs(mid2[y - 1])
                )
                s_left = (
                    mat_score[x - 1, y] + (abs(x - y) + 1) * gap_pen + abs(mid1[x - 1])
                )

                if s_diag <= s_up and s_diag <= s_left:
                    mat_score[x, y] = s_diag
                    mat_trace[x, y] = "DIAG"
                elif s_up <= s_left:
                    mat_score[x, y] = s_up
                    mat_trace[x, y] = "UP"
                else:
                    mat_score[x, y] = s_left
                    mat_trace[x, y] = "LEFT"

        r_mid1, r_mid2 = deque(), deque()
        x, y = s_x - 1, s_y - 1
        while x != 0 or y != 0:
            direction = mat_trace[x, y]
            if direction == "DIAG":
                r_mid1.appendleft(mid1[x - 1])
                r_mid2.appendleft(mid2[y - 1])
                x -= 1
                y -= 1
            elif direction == "UP":
                r_mid1.appendleft(0.0)
                r_mid2.appendleft(mid2[y - 1])
                y -= 1
            elif direction == "LEFT":
                r_mid1.appendleft(mid1[x - 1])
                r_mid2.appendleft(0.0)
                x -= 1
            else:
                raise Exception("Wrong direction in traceback.")

        if (
            np.isnan(r_mid1).any()
            or np.isinf(r_mid1).any()
            or np.isnan(r_mid2).any()
            or np.isinf(r_mid2).any()
        ):
            r_mid1 = np.nan_to_num(r_mid1, nan=0.0, posinf=0.0, neginf=0.0)
            r_mid2 = np.nan_to_num(r_mid2, nan=0.0, posinf=0.0, neginf=0.0)

        dist = euclidean(list(r_mid1), list(r_mid2))
        divide_by = np.sum([len(mid1), len(mid2)])
        norm_dist = np.abs(dist / divide_by)

        return (list(r_mid1), list(r_mid2), norm_dist)

    @staticmethod
    def get_monte_carlo_model(l1, l2, gap_pen):
        x = min(l1, l2)
        y = max(l1, l2)

        if (x, y) not in MIDAligner.mc_models:
            mc = MIDAligner.estimate_monte_carlo_model(l1, l2, gap_pen)
            MIDAligner.mc_models[(x, y)] = mc
        else:
            mc = MIDAligner.mc_models[(x, y)]

        return mc

    @staticmethod
    def estimate_monte_carlo_model(l1, l2, gap_pen):
        np.random.seed()
        distances = np.zeros(1000)

        for i in range(1000):
            v1 = np.random.rand(l1)
            v1 /= v1.sum()

            v2 = np.random.rand(l2)
            v2 /= v2.sum()

            _, _, distance = MIDAligner.align_vectors(v1, v2, gap_pen)
            distances[i] = distance

        mean_distance = distances.mean()
        sd_distance = distances.std()

        mc = MIDAligner.MC(mean_distance, sd_distance)
        return mc

    @staticmethod
    def calculate_zvalue(l1, l2, distance, gap_pen):
        mc = MIDAligner.get_monte_carlo_model(l1, l2, gap_pen)
        z = (distance - mc.mean_distance) / mc.sd_distance
        return z
