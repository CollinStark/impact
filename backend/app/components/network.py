import copy
import math
import multiprocessing
import warnings
from itertools import product
from time import time
from typing import Dict, List, Union

import numpy as np
from app.components.aligner import MIDAligner
from pandas import DataFrame
from scipy.stats import f_oneway, ttest_ind_from_stats

# Disable all warnings
warnings.filterwarnings("ignore")
multiprocessing.set_start_method("spawn", True)


class MIDsTyping:
    values: List[float]
    err: List[float]
    experiment: str
    condition: str
    fractional_contribution: float

    def replace_non_finite(self, val):
        """Replace non-finite float values with None."""
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            return None
        return val

    def to_dict(self):
        return {
            "values": [self.replace_non_finite(v) for v in self.values],
            "err": [self.replace_non_finite(e) for e in self.err],
            "experiment": str(self.experiment),
            "condition": str(self.condition),
        }


class QuantificationTyping:
    value: float
    err: float
    experiment: str

    def replace_non_finite(self, val):
        """Replace non-finite float values with None."""
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            return None
        return val

    def to_dict(self):
        return {
            "value": self.replace_non_finite(self.value),
            "err": self.replace_non_finite(self.err),
            "experiment": str(self.experiment),
        }


class NetworkElement:
    def __init__(
        self, name: str, id: Union[int, None], mz: float, rt: float, type: str = ""
    ):
        self.name = name
        if id is None:
            self.node_id = id
        else:
            self.node_id = int(id)
        self.id = None

        self.mz = mz
        self.rt = rt

        self.variability: List["VariabilityTyping"] = []
        self.quantification: List["QuantificationTyping"] = []
        self.mids: List["MIDsTyping"] = []
        self.fc = []
        self.fc_pool = []

        self.position = {"x": None, "y": None}
        self.type = type

        self.pool_variability = None
        self.fc_variability = None

    def __repr__(self) -> str:
        return f"<NetworkElement {self.name}>"

    def calc_pool_variability(self, all_quants):
        _, pvalue = f_oneway(*all_quants)
        self.pool_variability = pvalue

    def calc_fc_variability(self, all_fc):
        _, pvalue = f_oneway(*all_fc)
        self.fc_variability = pvalue

    def replace_non_finite(self, val):
        """Replace non-finite float values with None."""
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            return None
        return val

    def to_dict(self):
        return {
            "name": self.name,
            "id": self.id if self.id is not None else self.name,
            "node_id": self.node_id,
            "mz": self.mz,
            "rt": self.rt,
            "variability": [var.to_dict() for var in self.variability],
            "quantification": [quant.to_dict() for quant in self.quantification],
            "mids": [mid.to_dict() for mid in self.mids],
            "pool_variability": self.replace_non_finite(self.pool_variability),
            "fc_variability": self.replace_non_finite(self.fc_variability),
            "type": self.type,
            "fc": self.fc,
            "fc_pool": self.fc_pool,
        }

    def add_mids(self, experiment, condition, values, err):
        mids = MIDsTyping()
        mids.experiment = experiment
        mids.condition = condition
        mids.values = values
        mids.err = err
        mids.fractional_contribution = self.calculate_fc(values)

        self.mids.append(mids)

        return mids.fractional_contribution

    def calculate_fc(self, values: List[float]) -> float:
        fc = 0.0

        if len(values) <= 1:
            return fc

        for i in range(len(values)):
            fc += values[i] * i

        fc /= len(values) - 1
        return fc

    def add_quantification(self, value: float, err: float, experiment: str):
        quant = QuantificationTyping()
        quant.value = value
        quant.err = err
        quant.experiment = experiment
        self.quantification.append(quant)

    def add_fc(self, fc: float, experiment: str):
        self.fc.append({"value": fc, "experiment": experiment})

    def add_fc_pool(self, fc: float, experiment: str):
        self.fc_pool.append({"value": fc, "experiment": experiment})

    def get_mids(self, experiment, condition) -> Union["MIDsTyping", None]:
        for mids in self.mids:
            if mids.experiment == experiment and mids.condition == condition:
                return mids

    def get_name(self) -> str:
        return self.name

    def get_id(self) -> int | str:
        return self.id if self.id is not None else self.name


class NetworkConnection:
    def __init__(
        self,
        el1: NetworkElement,
        el2: NetworkElement,
        experiment: str,
    ):
        self.el1 = el1
        self.el2 = el2
        self.experiment = experiment

        self.al = None

        self.connections = {}
        self.min_distance = None
        self.max_distance = None
        self.mean_distance = None
        self.median_distance = None

    def add_connection(self, key, distance):
        self.connections[key] = distance

    def update_distances(self):
        distances = list(self.connections.values())
        if not distances:
            self.min_distance = self.max_distance = self.mean_distance = (
                self.median_distance
            ) = None
            return

        # Updating min, max, mean
        self.min_distance = min(distances)
        self.max_distance = max(distances)
        self.mean_distance = sum(distances) / len(distances)

        # Updating median
        distances.sort()
        n = len(distances)
        mid = n // 2
        if n % 2 == 0:
            self.median_distance = (distances[mid - 1] + distances[mid]) / 2
        else:
            self.median_distance = distances[mid]

    def to_dict(self):
        return {
            "source": self.el1 if isinstance(self.el1, str) else self.el1.get_id(),
            "target": self.el2 if isinstance(self.el2, str) else self.el2.get_id(),
            "experiment": str(self.experiment),
            "connections": self.connections,
            "min_distance": self.min_distance,
            "max_distance": self.max_distance,
            "mean_distance": self.mean_distance,
            "median_distance": self.median_distance,
        }

    def get_left_element(self) -> "NetworkElement":
        return self.el1

    def get_right_element(self) -> "NetworkElement":
        return self.el2

    def get_distance(self) -> float:
        return self.distance

    def set_connection_label(self, label: str):
        self.label = label

    def get_connection_label(self) -> str:
        return self.label

    def set_color(self, color: str):
        self.color = color

    def get_color(self) -> str:
        return self.color

    def set_MID_aligner(self, al: "MIDAligner"):
        self.al = al

    def get_MID_aligner(self) -> Union["MIDAligner", None]:
        return self.al

    def __lt__(self, con: "NetworkConnection") -> bool:
        return self.distance < con.distance


class Network:
    def __init__(
        self,
        sum_threshold=0.05,
        min_labeling=0.2,
        min_mid_len=3,
        excluded_conditions=["T0", "Ctrl"],
        min_quant=500,
        m0_threshold=0.90,
        unlabeled_conditions=["T0", "Ctrl"],
    ):
        self.sum_threshold = sum_threshold
        self.min_labeling = min_labeling
        self.min_mid_len = min_mid_len
        self.excluded_conditions = excluded_conditions
        self.min_quant = min_quant
        self.m0_threshold = m0_threshold
        self.unlabeled_conditions = unlabeled_conditions

        self.nodes: List["NetworkElement"] = []
        self.edges: List["NetworkConnection"] = []

        self.experiment: List[str] = []
        self.condition: List[str] = []

        self.all_pairs = None

    def read_pathway(self, pathway: Dict[str, List[str]]):
        old_nodes = []
        for node in pathway["elements"]["nodes"]:
            node_found = False
            if "compound_id" in node["data"]:
                try:
                    compound_id = int(node["data"]["compound_id"])
                except:
                    compound_id = node["data"]["compound_id"]
                if compound_id and str(compound_id).strip():
                    for net_node in self.nodes:
                        if net_node.node_id == int(compound_id):
                            if net_node not in old_nodes:
                                old_nodes.append(net_node)
                            new_node = copy.deepcopy(net_node)
                            new_node.id = node["data"]["id"]
                            new_node.name = node["data"]["Label"]

                            new_node.position = node["position"]
                            new_node.type = "mapped"
                            self.nodes.append(new_node)
                            node_found = True
                            break
            if not node_found:
                new_node = NetworkElement(
                    node["data"]["Label"], node["data"]["id"], None, None, "pathway"
                )
                new_node.id = node["data"]["id"]
                new_node.position = node["position"]
                self.nodes.append(new_node)

        self.nodes = [elem for elem in self.nodes if elem not in old_nodes]

        for edge in pathway["elements"]["edges"]:
            new_edge = NetworkConnection(
                edge["data"]["source"],
                edge["data"]["target"],
                "pathway",
            )
            new_edge.add_connection("pathway_pathway", 0)
            self.edges.append(new_edge)

    def read_pd(self, df: "DataFrame"):
        df["mids"] = df["mids"].fillna(0)
        df["cis"] = df["cis"].fillna(0)
        df["mass_isotopomer"] = df["mass_isotopomer"].apply(self.transform_isotopomer)

        df["experiment"] = df["experiment"].astype(str)
        df["condition"] = df["condition"].astype(str)

        self.experiment.extend(df["experiment"].unique())
        self.condition.extend(df["condition"].unique())

        filtered_conditions = [
            cond for cond in self.condition if cond not in self.excluded_conditions
        ]

        condition_pairs_with_self = list(product(filtered_conditions, repeat=2))
        self.all_pairs = {exp: condition_pairs_with_self for exp in self.experiment}

        for name in df["name"].unique():
            name_df = df.loc[df["name"] == name]

            if not any(
                name_df.groupby(["experiment", "condition"])["mids"].apply(
                    lambda x: len(x) >= self.min_mid_len
                )
            ):
                continue

            valid_m0 = True
            for exp in self.experiment:
                for cond in self.unlabeled_conditions:
                    t0_mids = name_df[
                        (name_df["experiment"] == exp) & (name_df["condition"] == cond)
                    ]["mids"]

                    if not t0_mids.empty and t0_mids.iloc[0] < self.m0_threshold:
                        valid_m0 = False
                        break

                if not valid_m0:
                    break

            if not valid_m0:
                continue

            node = NetworkElement(
                name,
                (
                    int(name_df["compound_id"].iloc[0])
                    if not np.isnan(name_df["compound_id"].iloc[0])
                    else None
                ),
                name_df["mz"].iloc[0],
                name_df["rt"].iloc[0],
                "unknown",
            )

            all_quants = []
            all_fc = []
            for i in range(len(self.experiment)):
                experiment_quant = 0.0
                experiment_se = 0.0

                experiment_quants = []
                experiment_ses = []
                experiment_fc = []
                experiment_fc_pool = []
                for condition in self.condition:
                    sub_df = name_df.loc[
                        (name_df["experiment"] == self.experiment[i])
                        & (name_df["condition"] == condition)
                    ]

                    quant = sub_df["intensity_mean"].sum()
                    if quant > experiment_quant:
                        experiment_quant = quant
                        experiment_se = sub_df["intensity_se"].sum()

                    sub_df = sub_df.sort_values(by="mass_isotopomer")

                    fc = node.add_mids(
                        self.experiment[i],
                        condition,
                        sub_df["mids"].tolist(),
                        sub_df["cis"].tolist(),
                    )
                    experiment_fc.append(fc)
                    experiment_quants.append(quant)
                    experiment_fc_pool.append(fc * quant)
                    experiment_ses.append(sub_df["intensity_se"].sum())
                node.add_quantification(
                    experiment_quants, experiment_ses, self.experiment[i]
                )
                node.add_fc(experiment_fc, self.experiment[i])
                node.add_fc_pool(experiment_fc_pool, self.experiment[i])
                all_quants.append(experiment_quants)
                all_fc.append(experiment_fc)

            means_above_threshold = False
            for quant_values in all_quants:
                if np.mean(quant_values) > self.min_quant:
                    means_above_threshold = True
                    break

            # Check if the mean of any experiment is above the threshold
            if not means_above_threshold:
                continue  # Skip adding this node

            node.calc_pool_variability(all_quants)
            node.calc_fc_variability(all_fc)

            self.nodes.append(node)

    def transform_isotopomer(self, isotopomer):
        if isinstance(isotopomer, str):
            return int(isotopomer.split("+")[-1])
        else:
            return int(isotopomer)

    def setup_connections(self, core_count: int = 1, manager=None, session_id=None):
        mid_pairs = [
            (self.nodes[i], self.nodes[j])
            for i in range(len(self.nodes))
            for j in range(i + 1, len(self.nodes))
        ]

        total_pairs = len(mid_pairs)
        last_reported_percent = -1  # To track when to send updates

        with multiprocessing.Pool(processes=core_count) as pool:
            results = []
            for i, res in enumerate(
                pool.imap_unordered(self.create_connection_wrapper, mid_pairs), start=1
            ):
                if res:
                    results.append(res)

                percent_completed = int(
                    100 * i / total_pairs
                )  # Round down to full percent
                if (
                    percent_completed > last_reported_percent
                ):  # Only send updates at full % changes
                    last_reported_percent = percent_completed
                    progress_bar = f"[{'#' * (percent_completed // 2)}{'-' * (50 - (percent_completed // 2))}]"
                    message = f"Progress: {percent_completed}% {progress_bar}"
                    if manager and session_id:
                        manager.send_message(session_id, message)

        # Flatten the list of results
        flattened_list = [item for sublist in results if sublist for item in sublist]
        self.edges.extend(flattened_list)

    def create_connection_wrapper(self, args):
        return self.create_connection(*args)

    def create_connection(
        self, el1: "NetworkElement", el2: "NetworkElement"
    ) -> Union["NetworkConnection", None]:
        connections = []
        if self.all_pairs is not None:
            for experiment, pairs in self.all_pairs.items():
                exp_conn = None
                for index, pair in enumerate(pairs):
                    mid1 = el1.get_mids(experiment, pair[0])
                    mid2 = el2.get_mids(experiment, pair[1])

                    if mid1 is None or mid2 is None:
                        continue

                    sum_mid1 = sum([abs(value) for value in mid1.values])
                    sum_mid2 = sum([abs(value) for value in mid2.values])

                    if (
                        sum_mid1 < 1 - self.sum_threshold
                        or sum_mid2 < 1 - self.sum_threshold
                        or sum_mid1 > 1 + self.sum_threshold
                        or sum_mid2 > 1 + self.sum_threshold
                    ):
                        continue

                    if (
                        mid1.values[0] > 1 - self.min_labeling
                        or mid2.values[0] > 1 - self.min_labeling
                    ):
                        continue

                    if (
                        mid1.fractional_contribution < self.min_labeling
                        or mid2.fractional_contribution < self.min_labeling
                    ):
                        continue

                    aligner = MIDAligner.align_MIDs(mid1.values, mid2.values)
                    zscore = aligner.get_zvalue()
                    distance = aligner.get_distance()
                    if zscore <= -1:
                        if exp_conn is None:
                            exp_conn = NetworkConnection(el1, el2, experiment)

                        exp_conn.add_connection(f"{pair[0]}_{pair[1]}", distance)

                if exp_conn is not None:
                    exp_conn.update_distances()
                    connections.append(exp_conn)

        return connections

    def get_json(self):
        nodes = [
            {"data": node.to_dict(), "position": node.position} for node in self.nodes
        ]
        edges = [{"data": edge.to_dict()} for edge in self.edges]

        data = {
            "nodes": nodes,
            "edges": edges,
            "experiments": self.experiment,
            "conditions": self.condition,
        }

        return data
